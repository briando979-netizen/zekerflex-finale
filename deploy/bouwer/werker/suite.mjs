// ---------------------------------------------------------------------------
// De hele testsuite in de controle (14 nov 2026). Raakt een wijziging meer dan 40 tests die een bestand als tekst
// noemen (tests/uitzend-v2.test.ts-patroon), dan draaide de controle alleen de bewakers en sloeg ze de rest stil over.
// Vannacht bleek de hele suite in 95 s te passen (942 bestanden, --maxWorkers=2), dus dan draait hij gewoon helemaal,
// binnen het zware slot dat de controle al heeft. Puur bestand: alleen het lezen van de vitest-uitvoer, zodat de test
// (tests/bouwer-suite.test.ts) het kan nabootsen zonder vitest te starten.
// ---------------------------------------------------------------------------

/** Dezelfde aanroep als de bewakers en de tekstverwijzende tests, zonder bestandsnamen: alles. */
export const SUITE_ARGS = ["vitest", "run", "--passWithNoTests", "--maxWorkers=2"];

/** Het aantal testbestanden uit de samenvatting ("Test Files  1 failed | 941 passed (942)"); null als die regel ontbreekt. */
export function telSuiteBestanden(uit) {
  const m = /Test Files\s+[^\n(]*\((\d+)\)/.exec(String(uit ?? ""));
  return m ? Number(m[1]) : null;
}

/** De testbestanden die faalden, in volgorde en zonder dubbelen ("FAIL  tests/x.test.ts > …" en "❯ tests/x.test.ts (3 tests | 1 failed)"). */
export function gefaaldeSuiteBestanden(uit) {
  const gezien = new Set();
  for (const m of String(uit ?? "").matchAll(/(?:FAIL|❯)\s+(tests\/[\w./-]+\.test\.ts)\b/g)) gezien.add(m[1]);
  return [...gezien];
}
