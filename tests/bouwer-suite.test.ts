import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// De controle vóór het live zetten (deploy/bouwer/werker/controle.mjs) draait bij meer dan 40 tekstverwijzende tests
// sinds 14 nov de hele suite in plaats van alleen de bewakers; suite.mjs leest de vitest-uitvoer.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const pad = new URL("../deploy/bouwer/werker/suite.mjs", import.meta.url).href;
type Suite = { SUITE_ARGS: string[]; telSuiteBestanden: (uit: string) => number | null; gefaaldeSuiteBestanden: (uit: string) => string[] };

describe("de hele suite in de controle", () => {
  it("leest het aantal bestanden uit de samenvatting, ook als er iets faalde", async () => {
    const s = (await import(/* @vite-ignore */ pad)) as Suite;
    expect(s.telSuiteBestanden(" Test Files  942 passed (942)\n      Tests  8549 passed (8549)")).toBe(942);
    expect(s.telSuiteBestanden(" Test Files  1 failed | 941 passed (942)\n      Tests  2 failed | 8547 passed (8549)")).toBe(942);
    expect(s.telSuiteBestanden("Error: vitest kon niet starten")).toBeNull();
    expect(s.telSuiteBestanden("")).toBeNull();
  });

  it("noemt de gefaalde bestanden één keer, uit beide vormen van de uitvoer", async () => {
    const s = (await import(/* @vite-ignore */ pad)) as Suite;
    const uit = [
      " ✓ tests/goed.test.ts (4 tests) 12ms",
      " ❯ tests/kapot.test.ts (3 tests | 1 failed) 8ms",
      "   × doet iets",
      " FAIL  tests/kapot.test.ts > blok > doet iets",
      " FAIL  tests/ook-kapot.test.ts > ander",
      "AssertionError: expected 1 to be 2",
    ].join("\n");
    expect(s.gefaaldeSuiteBestanden(uit)).toEqual(["tests/kapot.test.ts", "tests/ook-kapot.test.ts"]);
    expect(s.gefaaldeSuiteBestanden(" ✓ tests/goed.test.ts (4 tests)")).toEqual([]);
  });

  it("de aanroep is dezelfde als voor de bewakers, zonder bestandsnamen", async () => {
    const s = (await import(/* @vite-ignore */ pad)) as Suite;
    expect(s.SUITE_ARGS).toEqual(["vitest", "run", "--passWithNoTests", "--maxWorkers=2"]);
  });

  it("controle.mjs draait bij meer dan 40 tekstverwijzende tests de hele suite en zet het aantal in de uitslag", () => {
    const controle = lees("deploy/bouwer/werker/controle.mjs");
    expect(controle).toContain('from "./suite.mjs"');
    expect(controle).toContain("meer dan 40: de hele suite draait");
    expect(controle).toContain("heleSuite = { ok: x.code === 0, bestanden:");
    expect(controle).toContain("`hele suite: ${");
    expect(controle).not.toContain("alleen de bewakers draaien (hierboven)");
    // dezelfde omgeving en time-out als de tests die bij de wijziging horen
    expect(controle).toMatch(/\.\.\.SUITE_ARGS\], \{ cwd: REPO, env: testOmgeving\(\), timeout: 1_200_000, zonderSleutel: true \}/);
  });
});
