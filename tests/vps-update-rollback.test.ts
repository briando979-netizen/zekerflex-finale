import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Het uitrolscript legt de terugzetversie vast met een eigen functie. Hier draaien we alleen die functie, met een nagemaakte
// `docker` (een kleine tabel van tags naar image-id's) en een `sudo` die gewoon doorgeeft. Er wordt niets echt gestart.

const script = readFileSync(join(process.cwd(), "deploy/scripts/vps-update.sh"), "utf8").replace(/\r\n/g, "\n");
const functie = /# --- rollback-vastleggen begin ---\n([\s\S]*?)# --- rollback-vastleggen eind ---/.exec(script)?.[1] ?? "";

const heeftBash = spawnSync("bash", ["-c", "true"]).status === 0;

/** Draait de functie met de gegeven tags (naam=id) en geeft de tags erna terug. */
function draai(tags: Record<string, string>, voor: string): { tags: Record<string, string>; uit: string } {
  const start = Object.entries(tags).map(([k, v]) => `T[${JSON.stringify(k)}]=${JSON.stringify(v)}`).join("\n");
  const code = `
declare -A T
${start}
sudo() { "$@"; }
docker() {
  case "$1 $2" in
    "image inspect") [ -n "\${T[\${@: -1}]:-}" ] && echo "\${T[\${@: -1}]}" || return 1 ;;
    "tag "*) T["$3"]="\${T[$2]:-$2}" ;;
  esac
}
${functie}
rollback_vastleggen ${JSON.stringify(voor)}
for k in "\${!T[@]}"; do echo "TAG $k=\${T[$k]}"; done
`;
  const r = spawnSync("bash", ["-c", code], { encoding: "utf8" });
  const uit = r.stdout + r.stderr;
  const eind: Record<string, string> = {};
  for (const m of uit.matchAll(/^TAG (.+?)=(.*)$/gm)) eind[m[1]!] = m[2]!;
  return { tags: eind, uit };
}

describe.skipIf(!heeftBash)("vps-update.sh: de terugzetversie", () => {
  it("de functie staat in het script", () => {
    expect(functie).toContain("rollback_vastleggen()");
  });

  it("na een echte nieuwe versie wordt de vorige de terugzetversie", () => {
    // Y draaide; deze uitrol bouwde Z (latest wijst nu naar Z)
    const r = draai({ "zekerflex-app:latest": "Z", "zekerflex-app:rollback": "X" }, "Y");
    expect(r.tags["zekerflex-app:rollback"]).toBe("Y");
    expect(r.tags["zekerflex-app:latest"]).toBe("Z");
  });

  it("een uitrol die niets veranderde laat de echte vorige versie staan (de fout van 13 nov)", () => {
    // Y draaide en de build gaf weer Y: rollback blijft X
    const r = draai({ "zekerflex-app:latest": "Y", "zekerflex-app:rollback": "X" }, "Y");
    expect(r.tags["zekerflex-app:rollback"]).toBe("X");
    expect(r.uit).toContain("niet veranderd");
  });

  it("zonder bekende vorige versie (eerste installatie) gebeurt er niets en gaat het niet mis", () => {
    const r = draai({ "zekerflex-app:latest": "Z" }, "");
    expect(r.tags["zekerflex-app:rollback"]).toBeUndefined();
  });
});

describe("vps-update.sh: volgorde", () => {
  it("legt de terugzetversie niet meer vóór het bouwen vast", () => {
    expect(script).not.toMatch(/^sudo docker tag zekerflex-app:latest zekerflex-app:rollback$/m);
  });

  it("legt hem direct na een geslaagde build vast en herstelt bij een mislukte migratie de vorige draaiende versie", () => {
    expect(script).toMatch(/if sudo \$C build app; then\n\s+rollback_vastleggen "\$LIVE_VOOR"/);
    expect(script).toContain('docker tag "${LIVE_VOOR:-zekerflex-app:rollback}" zekerflex-app:latest');
  });
});
