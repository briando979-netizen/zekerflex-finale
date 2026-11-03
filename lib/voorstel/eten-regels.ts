// ---------------------------------------------------------------------------
// "Blijf je eten?" na een reservering: een link naar het aanvraagformulier
// dat alvast is ingevuld (gelegenheid Restaurant, datum, aantal en een
// bericht met het reserveringsnummer). Alles staat in de link zelf; de
// server zoekt geen boeking op, dus er lekt niets via een geraden nummer.
// Puur, dus ook in de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

/** Hun eigen restaurantpagina's die na een activiteit passen. */
export const ETEN_NA_ACTIVITEIT = [
  { pad: "/restaurant/bbq", naam: "Schwarzwalder BBQ-buffet" },
  { pad: "/restaurant/hittesteen", naam: "Hittesteen" },
  { pad: "/restaurant/warm-en-koud-buffet", naam: "Warm en koud buffet" },
] as const;

export interface NaBoeking {
  id: string;
  activiteit: string;
  datum: string;
  tijd: string;
  personen: number;
}

/** Pad naar het aanvraagformulier, ingevuld voor eten na deze reservering. */
export function etenAanvraagPad(base: string, b: NaBoeking): string {
  const q = new URLSearchParams({ voor: "restaurant", datum: b.datum, personen: String(b.personen), na: b.activiteit, tijd: b.tijd, nr: b.id });
  return `${base}/reserveren?${q.toString()}#aanvraag`;
}

export interface EtenInvulling {
  datum: string;
  aantal: string;
  bericht: string;
}

/**
 * Wat het aanvraagformulier vooraf invult uit de link. Elk deel wordt los
 * gecontroleerd; wat niet klopt, blijft leeg. Alleen bij voor=restaurant.
 */
export function leesEtenInvulling(q: Record<string, string>, namen: Record<string, string>): EtenInvulling | null {
  if (q.voor !== "restaurant") return null;
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(q.datum ?? "") ? (q.datum ?? "") : "";
  const n = Number(q.personen);
  const aantal = Number.isInteger(n) && n >= 1 && n <= 1000 ? String(n) : "";
  const naam = Object.prototype.hasOwnProperty.call(namen, q.na ?? "") ? namen[q.na ?? ""] : undefined;
  const tijd = /^\d{2}:\d{2}$/.test(q.tijd ?? "") ? q.tijd : "";
  const nr = /^[0-9A-F]{8}$/.test(q.nr ?? "") ? q.nr : "";
  const bericht = naam && tijd && nr ? `Wij willen graag eten na onze reservering ${nr} (${naam} om ${tijd} uur).` : "";
  return datum || aantal || bericht ? { datum, aantal, bericht } : null;
}
