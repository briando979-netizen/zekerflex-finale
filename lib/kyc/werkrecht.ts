// ---------------------------------------------------------------------------
// Recht om te werken en leeftijd, uit de MRZ of de chip (9 nov 2026).
//  - Wet arbeid vreemdelingen: wie de nationaliteit van een EU-land, de EER
//    (IJsland, Liechtenstein, Noorwegen) of Zwitserland heeft, mag vrij werken.
//    Anders is een verblijfsdocument met "arbeid vrij toegestaan" of een
//    tewerkstellingsvergunning (TWV) nodig: een medewerker vraagt het op. Een
//    werkgever riskeert zonder die controle een boete per werker.
//  - Leeftijd: onder de 16 geen gewoon werk; 16 en 17 mag met beperkingen
//    (Arbeidstijdenwet). Beide gaan naar een medewerker, nooit een stille afwijzing.
// Bewaard wordt alleen de uitkomst (categorie), niet de nationaliteit of de
// geboortedatum. Puur: los te testen in tests/kyc-werkrecht.test.ts.
// ---------------------------------------------------------------------------

/** ISO 3166-1 alpha-3 zoals in de MRZ: EU-27, EER en Zwitserland. */
const VRIJ = new Set([
  "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "IRL",
  "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
  "ISL", "LIE", "NOR", "CHE",
]);

/** De MRZ schrijft Duitsland als "D<<"; vulling eraf. */
export function landcode(code: string | null | undefined): string {
  const c = (code ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return c === "D" ? "DEU" : c;
}

export type Werkrecht = "vrij" | "controle";

/** Vrij werken (EU/EER/CH) of een document nodig; null als de nationaliteit onbekend is. */
export function werkrechtVan(nationaliteit: string | null | undefined): Werkrecht | null {
  const c = landcode(nationaliteit);
  if (c.length !== 3) return null;
  return VRIJ.has(c) ? "vrij" : "controle";
}

export type Leeftijdsgroep = "volwassen" | "minderjarig" | "te-jong";

/** Leeftijd in hele jaren op een dag (beide yyyy-mm-dd). */
export function leeftijdOp(geboortedatum: string, dag: string): number | null {
  const g = /^(\d{4})-(\d{2})-(\d{2})$/.exec(geboortedatum);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dag);
  if (!g || !d) return null;
  let jaren = Number(d[1]) - Number(g[1]);
  if (`${d[2]}-${d[3]}` < `${g[2]}-${g[3]}`) jaren--;
  return jaren;
}

/** 18+ volwassen, 16–17 minderjarig, jonger te jong. `dag` = vandaag in Nederland (yyyy-mm-dd). */
export function leeftijdsgroep(geboortedatum: string | null | undefined, dag: string): Leeftijdsgroep | null {
  if (!geboortedatum) return null;
  const j = leeftijdOp(geboortedatum, dag);
  if (j === null || j < 0 || j > 120) return null;
  return j >= 18 ? "volwassen" : j >= 16 ? "minderjarig" : "te-jong";
}

export const WERKRECHT_TEKST: Record<Werkrecht, string> = {
  vrij: "Nationaliteit uit de EU, de EER of Zwitserland: vrij om in Nederland te werken",
  controle: "Nationaliteit buiten de EU/EER: een verblijfsdocument met 'arbeid vrij toegestaan' of een werkvergunning (TWV) is nodig. Een medewerker vraagt dit op.",
};

export const LEEFTIJD_TEKST: Record<Leeftijdsgroep, string> = {
  volwassen: "18 jaar of ouder",
  minderjarig: "16 of 17 jaar: werken mag, met de beperkingen van de Arbeidstijdenwet. Een medewerker kijkt mee.",
  "te-jong": "Jonger dan 16: geen gewoon werk via ZekerFlex. Een medewerker kijkt mee.",
};
