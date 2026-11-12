import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// De bewakers (12 nov 2026): tests die de hele code doorzoeken, draaien bij elke controle vóór een uitrol
// (deploy/bouwer/werker/controle.mjs), want vitest related ziet ze niet. Deze test houdt de lijst bij.

interface Bewakers {
  leesBewakerLijst(tekst: string | null | undefined): { lijst: string[]; waarschuwing: string | null };
  gefaaldeBewakers(uit: string | null | undefined, lijst: string[]): string[];
}

const ROOT = process.cwd();
const lijstTekst = readFileSync(path.join(ROOT, "tests", "bewakers.json"), "utf8");
let b: Bewakers;

beforeAll(async () => {
  // gewone .mjs zonder typen (draait in de bouwer-container)
  const pad = new URL("../deploy/bouwer/werker/bewakers.mjs", import.meta.url).href;
  b = (await import(/* @vite-ignore */ pad)) as Bewakers;
});

describe("de lijst bewakers", () => {
  it("is geldig en elk bestand bestaat", () => {
    const { lijst, waarschuwing } = b.leesBewakerLijst(lijstTekst);
    expect(waarschuwing).toBeNull();
    expect(lijst.length).toBeGreaterThan(5);
    for (const p of lijst) expect(() => readFileSync(path.join(ROOT, p)), p).not.toThrow();
  });

  it("elke test die app/, lib/ of components/ doorzoekt, staat erin (anders ziet de controle hem niet)", () => {
    const { lijst } = b.leesBewakerLijst(lijstTekst);
    const zoekend = readdirSync(path.join(ROOT, "tests"))
      .filter((n) => n.endsWith(".test.ts"))
      .map((n) => `tests/${n}`)
      .filter((p) => {
        const t = readFileSync(path.join(ROOT, p), "utf8");
        return /readdirSync|globSync|\blopen\(/.test(t) && /["'`/](app|lib|components)["'`/]/.test(t);
      });
    expect(zoekend.filter((p) => !lijst.includes(p)), "zet deze in tests/bewakers.json").toEqual([]);
  });
});

describe("lezen en uitslag (deploy/bouwer/werker/bewakers.mjs)", () => {
  it("kapot, leeg of zonder lijst: niets, met een reden (dan alleen vitest related)", () => {
    expect(b.leesBewakerLijst("")).toEqual({ lijst: [], waarschuwing: "tests/bewakers.json ontbreekt" });
    expect(b.leesBewakerLijst(null)).toEqual({ lijst: [], waarschuwing: "tests/bewakers.json ontbreekt" });
    expect(b.leesBewakerLijst("{ kapot").waarschuwing).toMatch(/geen geldige JSON/);
    expect(b.leesBewakerLijst("[]").waarschuwing).toMatch(/geen lijst/);
    expect(b.leesBewakerLijst('{"bewakers": []}').waarschuwing).toMatch(/leeg/);
  });

  it("alleen tests/<naam>.test.ts, zonder dubbele of vreemde paden", () => {
    const { lijst } = b.leesBewakerLijst(JSON.stringify({ bewakers: ["tests/a.test.ts", "tests/a.test.ts", "../etc/passwd", "tests/x.ts", 42, "tests/sub/b.test.ts"] }));
    expect(lijst).toEqual(["tests/a.test.ts"]);
  });

  it("noemt de bewaker die faalde, uit de uitvoer van vitest", () => {
    const uit = " FAIL  tests/a11y-alert-roles.test.ts > foutmeldingen worden voorgelezen\n ✓ tests/regex-safari.test.ts (3 tests)";
    expect(b.gefaaldeBewakers(uit, ["tests/a11y-alert-roles.test.ts", "tests/regex-safari.test.ts"])).toEqual(["tests/a11y-alert-roles.test.ts"]);
    expect(b.gefaaldeBewakers("", ["tests/a11y-alert-roles.test.ts"])).toEqual([]);
  });
});
