import { describe, expect, it } from "vitest";
// gewone .mjs zonder typen (draait in de Bouwer-container): dynamisch inladen en hier de vorm beschrijven
type Test = { pad: string; inhoud: string };
const mod = (await import(/* @vite-ignore */ new URL("../deploy/bouwer/werker/tekst-verwijzing.mjs", import.meta.url).href)) as {
  MAX_EXTRA: number;
  bouwIndex: (testen: Test[]) => Map<string, Set<string>>;
  normaliseer: (stuk: string) => string;
  teAlgemeen: (pad: string) => boolean;
  vindTekstVerwijzingen: (gewijzigd: string[], testen: Test[], opties?: { max?: number }) => { tests: string[]; gevonden: number; afgekapt: boolean; redenen: Record<string, string[]> };
};
const { MAX_EXTRA, bouwIndex, normaliseer, teAlgemeen, vindTekstVerwijzingen } = mod;

// Nagemaakte bestandslijst: geen echte schijf. De controle (deploy/bouwer/werker/controle.mjs) leest de testinhoud zelf uit de werkkopie.
const t = (pad: string, inhoud: string) => ({ pad: `tests/${pad}.test.ts`, inhoud });
const ZOEK = "lib/onboarding/werker-poort-server.ts";

describe("tests die een gewijzigd bestand als tekst noemen", () => {
  it("vindt de test die het pad met extensie noemt (uitzend-v2 van 13 nov)", () => {
    const testen = [
      t("uitzend-v2", `for (const f of ["lib/onboarding/werker-poort-server.ts", "lib/fiscal/eligibility.ts"]) expect(bron(f)).toContain("activeUitzendContract");`),
      t("andere", `import { x } from "@/lib/ops/backup"; expect(x).toBe(1);`),
    ];
    const v = vindTekstVerwijzingen([ZOEK], testen);
    expect(v.tests).toEqual(["tests/uitzend-v2.test.ts"]);
    expect(v.redenen["tests/uitzend-v2.test.ts"]).toEqual([ZOEK]);
  });

  it("vindt ook het pad zonder extensie, met @/ ervoor of als relatief pad", () => {
    const testen = [
      t("a", `import { w } from "@/lib/onboarding/werker-poort-server";`),
      t("b", `const p = "../lib/onboarding/werker-poort-server";`),
      t("c", "readFileSync(`lib/onboarding/werker-poort-server.ts`)"),
    ];
    expect(vindTekstVerwijzingen([ZOEK], testen).tests).toEqual(["tests/a.test.ts", "tests/b.test.ts", "tests/c.test.ts"]);
    // en andersom: de test noemt de extensie, het gewijzigde pad heeft er geen in de lijst (gewijzigde paden hebben er altijd een, dit is de index)
    expect([...bouwIndex([t("x", `"lib/a/b/mijn-bestand.ts"`)]).keys()].sort()).toEqual(["lib/a/b/mijn-bestand", "lib/a/b/mijn-bestand.ts"]);
  });

  it("matcht op hele paden: een langer pad, een andere map of alleen de bestandsnaam trekt de test niet mee", () => {
    const testen = [
      t("langer", `"lib/onboarding/werker-poort-server-extra.ts"`),
      t("andere-map", `"lib/fiscal/werker-poort-server.ts"`),
      t("alleen-naam", `de werker-poort-server levert de stand; zie werker-poort-server.ts`),
      t("voorvoegsel", `"xlib/onboarding/werker-poort-server.ts"`),
    ];
    expect(vindTekstVerwijzingen([ZOEK], testen).tests).toEqual([]);
  });

  it("slaat korte of algemene paden over, zodat route.ts of index.ts niet de halve testmap meetrekt", () => {
    const testen = [t("veel", `"app/api/x/route.ts" "route.ts" "index.ts" "lib/a.ts" "types.ts" "page.tsx"`)];
    for (const kort of ["lib/a.ts", "route.ts", "index.ts", "src/x.ts", "lib/index.ts", "app/page.tsx"]) {
      expect(teAlgemeen(kort), kort).toBe(true);
      expect(vindTekstVerwijzingen([kort], testen).tests, kort).toEqual([]);
    }
    // een lang pad waarvan de bestandsnaam wel algemeen is, telt: de hele map staat erin
    expect(teAlgemeen("app/api/x/route.ts")).toBe(false);
    expect(vindTekstVerwijzingen(["app/api/x/route.ts"], testen).tests).toEqual(["tests/veel.test.ts"]);
    // een los bestand in de hoofdmap met een duidelijke naam kan wel
    expect(vindTekstVerwijzingen(["middleware.ts"], [t("mw", `readFileSync("middleware.ts")`)]).tests).toEqual(["tests/mw.test.ts"]);
  });

  it("voegt dubbele paden samen: één test die meerdere vormen of meerdere gewijzigde bestanden noemt, draait één keer", () => {
    const testen = [t("dubbel", `"lib/onboarding/werker-poort-server.ts" "lib/onboarding/werker-poort-server" "lib/fiscal/eligibility.ts"`)];
    const v = vindTekstVerwijzingen([ZOEK, ZOEK, "lib/fiscal/eligibility.ts"], testen);
    expect(v.tests).toEqual(["tests/dubbel.test.ts"]);
    expect(v.redenen["tests/dubbel.test.ts"]).toEqual([ZOEK, "lib/fiscal/eligibility.ts"]);
  });

  it("een test die zichzelf noemt, of die zelf gewijzigd is, is geen extra (vitest related draait hem al)", () => {
    const eigen = t("zelf", `de test staat in "tests/zelf.test.ts" en leest "lib/onboarding/werker-poort-server.ts"`);
    expect(vindTekstVerwijzingen(["tests/zelf.test.ts"], [eigen]).tests).toEqual([]);
    expect(vindTekstVerwijzingen([ZOEK, "tests/zelf.test.ts"], [eigen]).tests).toEqual([]);
    // dezelfde test, niet gewijzigd: wel
    expect(vindTekstVerwijzingen([ZOEK], [eigen]).tests).toEqual(["tests/zelf.test.ts"]);
  });

  it("de grens van 40: precies 40 draaien, 41 niet (dan de hele suite) maar het echte aantal wordt gemeld", () => {
    const maak = (n: number) => Array.from({ length: n }, (_, i) => t(`t${String(i).padStart(3, "0")}`, `"${ZOEK}"`));
    const veertig = vindTekstVerwijzingen([ZOEK], maak(40));
    expect(MAX_EXTRA).toBe(40);
    expect(veertig.tests).toHaveLength(40);
    expect(veertig.afgekapt).toBe(false);
    const eenenveertig = vindTekstVerwijzingen([ZOEK], maak(41));
    expect(eenenveertig.tests).toEqual([]);
    expect(eenenveertig.afgekapt).toBe(true);
    expect(eenenveertig.gevonden).toBe(41);
    expect(Object.keys(eenenveertig.redenen)).toHaveLength(41);
    expect(vindTekstVerwijzingen([ZOEK], maak(41), { max: 50 }).tests).toHaveLength(41);
  });

  it("padtekens: haakjes (route groups), leestekens en @/ worden goed gelezen", () => {
    expect(normaliseer("@/app/(marketing)/website-maken/page.tsx")).toBe("app/(marketing)/website-maken/page.tsx");
    expect(normaliseer("../../lib/x/y.ts),")).toBe("lib/x/y.ts");
    const v = vindTekstVerwijzingen(["app/(marketing)/website-maken/page.tsx"], [t("wm", `readFileSync("app/(marketing)/website-maken/page.tsx", "utf8")`)]);
    expect(v.tests).toEqual(["tests/wm.test.ts"]);
  });

  it("is snel op veel tests (één index, geen zoekactie per test per pad)", () => {
    const veel = Array.from({ length: 3000 }, (_, i) => t(`veel${i}`, `import x from "@/lib/groep${i % 50}/bestand${i}"; const p = "app/api/onderdeel${i}/route.ts"; `.repeat(20)));
    const gewijzigd = Array.from({ length: 200 }, (_, i) => `lib/groep${i % 50}/bestand${i}.ts`);
    const begin = Date.now();
    vindTekstVerwijzingen(gewijzigd, veel);
    expect(Date.now() - begin).toBeLessThan(3000);
  });

  it("de controle gebruikt de functie, meldt extraTests in de uitslag en breekt niet stil af", async () => {
    const { readFileSync } = await import("node:fs");
    const controle = readFileSync(new URL("../deploy/bouwer/werker/controle.mjs", import.meta.url), "utf8").split("\r\n").join("\n");
    expect(controle).toContain('import { vindTekstVerwijzingen } from "./tekst-verwijzing.mjs";');
    expect(controle).toContain("vindTekstVerwijzingen(bestanden, testen)");
    expect(controle).toContain("      extraTests,");
    // sinds 14 nov draait bij meer dan 40 de hele suite (deploy/bouwer/werker/suite.mjs), niet alleen de bewakers
    expect(controle).toContain("meer dan 40: de hele suite draait");
    expect(controle).toContain("extraTests.heleSuite = {");
    expect(controle).toMatch(/catch \(e\) \{\s*log\("info", `Tests met een tekstverwijzing overgeslagen/);
  });
});