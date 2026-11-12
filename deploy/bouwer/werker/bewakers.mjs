// De bewakers van de controle (controle.mjs, 12 nov 2026): tests die de hele code doorzoeken, zoals "elke foutmelding
// heeft een role" of "geen lookbehind in code die de browser bereikt". `vitest related` ziet ze niet, want ze horen bij
// geen enkel gewijzigd bestand: de a11y-bewaker faalde daardoor dagen stil op main. Daarom draaien ze bij elke controle.
// De lijst staat in de gecontroleerde vastlegging zelf (tests/bewakers.json); tests/bewakers.test.ts eist dat elke test
// die de code doorzoekt erin staat. Puur bestand, ook voor die test.

const GELDIG = /^tests\/[\w.-]+\.test\.ts$/;

/**
 * Leest tests/bewakers.json. Ontbreekt hij, is hij kapot of leeg, dan een lege lijst met een reden: de controle draait
 * dan alleen de tests die bij de wijziging horen, want een kapotte controle houdt elke uitrol tegen.
 * @param {string | null | undefined} tekst
 * @returns {{ lijst: string[]; waarschuwing: string | null }}
 */
export function leesBewakerLijst(tekst) {
  if (typeof tekst !== "string" || !tekst.trim()) return { lijst: [], waarschuwing: "tests/bewakers.json ontbreekt" };
  let ruw;
  try {
    ruw = JSON.parse(tekst);
  } catch {
    return { lijst: [], waarschuwing: "tests/bewakers.json is geen geldige JSON" };
  }
  const items = ruw && typeof ruw === "object" && Array.isArray(ruw.bewakers) ? ruw.bewakers : null;
  if (!items) return { lijst: [], waarschuwing: 'tests/bewakers.json heeft geen lijst "bewakers"' };
  const lijst = [...new Set(items.filter((p) => typeof p === "string" && GELDIG.test(p)))];
  return lijst.length ? { lijst, waarschuwing: null } : { lijst: [], waarschuwing: "tests/bewakers.json is leeg" };
}

/**
 * Welke bewakers faalden, uit de uitvoer van vitest ("FAIL  tests/x.test.ts > …").
 * @param {string | null | undefined} uit
 * @param {string[]} lijst
 * @returns {string[]}
 */
export function gefaaldeBewakers(uit, lijst) {
  const tekst = String(uit ?? "");
  return lijst.filter((p) => new RegExp(`(?:FAIL|×)\\s+${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(tekst));
}
