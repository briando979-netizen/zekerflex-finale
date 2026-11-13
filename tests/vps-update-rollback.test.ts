import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Het uitrolscript legt de terugzetversie vast met eigen functies. Hier draaien we alleen die functies, met een nagemaakte
// `docker` en een `sudo` die gewoon doorgeeft. Er wordt niets echt gestart.
//
// De nagemaakte opslag gedraagt zich als de containerd-opslag van de server: een image bestaat alleen zolang hij een naam
// heeft. Verplaatst een naam naar een ander image en heeft het oude geen enkele naam meer, dan is het weg ("No such image").
// Zo mislukte de eerste versie van deze fix live (taggen op id).

const script = readFileSync(join(process.cwd(), "deploy/scripts/vps-update.sh"), "utf8").replace(/\r\n/g, "\n");
const functies = /# --- rollback-vastleggen begin ---\n([\s\S]*?)# --- rollback-vastleggen eind ---/.exec(script)?.[1] ?? "";

const heeftBash = spawnSync("bash", ["-c", "true"]).status === 0;

type Tags = Record<string, string>;

/** Draait `stappen` (bash) met de begintags en geeft de tags erna terug, plus alles wat er uitgeprint is. */
function draai(begin: Tags, stappen: string): { tags: Tags; uit: string } {
  const start = Object.entries(begin).map(([k, v]) => `T[${JSON.stringify(k)}]=${JSON.stringify(v)}`).join("\n");
  const code = `
declare -A T
${start}
bestaat() { local n; for n in "\${!T[@]}"; do [ "\${T[$n]}" = "$1" ] && return 0; done; return 1; }
sudo() { "$@"; }
docker() {
  case "$1" in
    tag)
      local id
      if [ -n "\${T[$2]:-}" ]; then id="\${T[$2]}"; elif bestaat "$2"; then id="$2"; else echo "Error response from daemon: No such image: $2" >&2; return 1; fi
      T["$3"]="$id" ;;
    rmi) [ -n "\${T[$2]:-}" ] && unset 'T[$2]' || return 1 ;;
    image) # image inspect -f '{{.Id}}' NAAM
      local w="\${@: -1}"
      if [ -n "\${T[$w]:-}" ]; then echo "\${T[$w]}"; elif bestaat "$w"; then echo "$w"; else return 1; fi ;;
  esac
}
${functies}
${stappen}
for k in "\${!T[@]}"; do echo "TAG $k=\${T[$k]}"; done
`;
  const r = spawnSync("bash", ["-c", code], { encoding: "utf8" });
  const uit = r.stdout + r.stderr;
  const tags: Tags = {};
  for (const m of uit.matchAll(/^TAG (.+?)=(.*)$/gm)) tags[m[1]!] = m[2]!;
  return { tags, uit };
}

const LATEST = "zekerflex-app:latest";
const ROLLBACK = "zekerflex-app:rollback";
const VOOR = "zekerflex-app:voor-uitrol";

describe.skipIf(!heeftBash)("vps-update.sh: de terugzetversie", () => {
  it("de functies staan in het script", () => {
    for (const f of ["voor_uitrol_vastleggen()", "voor_uitrol_weg()", "rollback_vastleggen()", "migratie_mislukt_herstel()"]) expect(functies).toContain(f);
  });

  it("de nagemaakte opslag werkt als containerd: taggen op het id van een naamloos image faalt (de fout van de eerste fix)", () => {
    const r = draai({ [LATEST]: "Y" }, `T["${LATEST}"]=Z\ndocker tag Y zekerflex-app:rollback || echo GEFAALD`);
    expect(r.uit).toContain("No such image");
    expect(r.tags[ROLLBACK]).toBeUndefined();
  });

  it("een echte nieuwe versie: de vorige draaiende wordt de terugzetversie, de tijdelijke naam is weg", () => {
    // Y draait, de build geeft Z
    const r = draai({ [LATEST]: "Y", [ROLLBACK]: "X" }, `voor_uitrol_vastleggen\nT["${LATEST}"]=Z\nrollback_vastleggen\nvoor_uitrol_weg`);
    expect(r.tags[ROLLBACK]).toBe("Y");
    expect(r.tags[LATEST]).toBe("Z");
    expect(r.tags[VOOR]).toBeUndefined();
  });

  it("een uitrol die niets veranderde laat de echte vorige versie staan (de fout van 13 nov)", () => {
    // Y draait en de build geeft weer Y
    const r = draai({ [LATEST]: "Y", [ROLLBACK]: "X" }, `voor_uitrol_vastleggen\nT["${LATEST}"]=Y\nrollback_vastleggen\nvoor_uitrol_weg`);
    expect(r.tags[ROLLBACK]).toBe("X");
    expect(r.tags[LATEST]).toBe("Y");
    expect(r.tags[VOOR]).toBeUndefined();
    expect(r.uit).toContain("niet veranderd");
  });

  it("een mislukte build laat latest en de terugzetversie ongemoeid en ruimt de tijdelijke naam op", () => {
    const r = draai({ [LATEST]: "Y", [ROLLBACK]: "X" }, "voor_uitrol_vastleggen\nvoor_uitrol_weg");
    expect(r.tags).toEqual({ [LATEST]: "Y", [ROLLBACK]: "X" });
  });

  it("een mislukte migratie zet de draaiende versie terug als latest en raakt de terugzetversie niet aan", () => {
    const r = draai({ [LATEST]: "Y", [ROLLBACK]: "X" }, `voor_uitrol_vastleggen\nT["${LATEST}"]=Z\nmigratie_mislukt_herstel\nvoor_uitrol_weg`);
    expect(r.tags[LATEST]).toBe("Y");
    expect(r.tags[ROLLBACK]).toBe("X");
    expect(r.tags[VOOR]).toBeUndefined();
  });

  it("zonder draaiende versie (eerste installatie) gebeurt er niets en gaat het niet mis", () => {
    const r = draai({}, `voor_uitrol_vastleggen\nT["${LATEST}"]=Z\nrollback_vastleggen\nvoor_uitrol_weg`);
    expect(r.tags[ROLLBACK]).toBeUndefined();
    expect(r.tags[LATEST]).toBe("Z");
  });
});

describe("vps-update.sh: volgorde", () => {
  it("houdt de draaiende versie vóór het bouwen vast met een naam en legt de terugzetversie niet meer vóór het bouwen vast", () => {
    expect(script).toMatch(/^voor_uitrol_vastleggen$/m);
    expect(script).not.toMatch(/^sudo docker tag zekerflex-app:latest zekerflex-app:rollback$/m);
    expect(script.indexOf("\nvoor_uitrol_vastleggen\n")).toBeLessThan(script.indexOf("sudo $C build app"));
  });

  it("legt hem pas ná het migreren vast, en ruimt de tijdelijke naam in de EXIT-trap op", () => {
    expect(script.indexOf("migrate deploy")).toBeLessThan(script.indexOf("\n    rollback_vastleggen\n"));
    expect(script).toContain("trap 'ollama_terug; voor_uitrol_weg' EXIT");
    expect(script).toContain("migratie_mislukt_herstel\n");
  });

  it("taggen op een id komt niet meer voor", () => {
    expect(script).not.toMatch(/docker tag "\$voor"/);
    expect(script).not.toContain("LIVE_VOOR");
  });
});
