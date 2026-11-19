// ---------------------------------------------------------------------------
// De rekenhulp "Hoeveel reacties mag je verwachten?" van het SmileyApp-voorstel
// (deel 6b). Op smileyapp.nl staat geen responspercentage, dus hier ook niet:
// er is geen standaardwaarde en geen voorbeeld. De rekenhulp bestaat pas als
// een beheerder in het beheer zelf een percentage invult, met een zin over
// waar dat cijfer vandaan komt; die zin staat op de site onder de uitkomst.
// Leeg maken in het beheer haalt het blok weer weg. Puur bestand: de regels
// voor het beheer, de opslag en het scherm in de browser.
// ---------------------------------------------------------------------------

export const RESPONS_MIN = 1;
export const RESPONS_MAX = 100;
export const BRON_MIN = 10;
export const BRON_MAX = 160;
export const KLANTEN_MIN = 1;
export const KLANTEN_MAX = 1_000_000;

export interface Respons {
  /** heel getal van 1 tot en met 100, door het team zelf ingevuld */
  percentage: number;
  /** waar het cijfer vandaan komt, in de woorden van het team */
  bron: string;
}

export type ResponsUitkomst = { ok: true; waarde: Respons } | { ok: false; veld: "percentage" | "bron"; fout: string };

/** Een heel getal uit een getal of uit alleen cijfers; al het andere (ook "12,5" en "1e2") is geen getal. */
function heelGetal(ruw: unknown): number | null {
  if (typeof ruw === "number") return Number.isInteger(ruw) ? ruw : null;
  if (typeof ruw !== "string" || !/^\d{1,9}$/.test(ruw.trim())) return null;
  return Number(ruw.trim());
}

const eenRegel = (ruw: string) =>
  ruw
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Wat een beheerder invult: het percentage en de bronzin, allebei verplicht. */
export function leesRespons(invoer: { percentage: unknown; bron: unknown }): ResponsUitkomst {
  const percentage = heelGetal(invoer.percentage);
  if (percentage === null || percentage < RESPONS_MIN || percentage > RESPONS_MAX) {
    return { ok: false, veld: "percentage", fout: `Vul een heel getal in van ${RESPONS_MIN} tot en met ${RESPONS_MAX}.` };
  }
  if (typeof invoer.bron !== "string") return { ok: false, veld: "bron", fout: "Schrijf waar dit cijfer vandaan komt." };
  const bron = eenRegel(invoer.bron);
  if (bron.length < BRON_MIN) return { ok: false, veld: "bron", fout: `Schrijf waar dit cijfer vandaan komt, in minstens ${BRON_MIN} tekens. Zonder bron komt de rekenhulp niet op de site.` };
  if (bron.length > BRON_MAX) return { ok: false, veld: "bron", fout: `De bron is hooguit ${BRON_MAX} tekens (nu ${bron.length}).` };
  return { ok: true, waarde: { percentage, bron } };
}

/** De instelling uit de opslag. Alles wat niet volledig klopt is "geen instelling": dan staat er niets op de site. */
export function responsUitOpslag(ruw: unknown): Respons | null {
  if (typeof ruw !== "object" || ruw === null) return null;
  const r = ruw as { percentage?: unknown; bron?: unknown };
  // uit de opslag alleen een echt getal: een tekst die op een getal lijkt hoort daar niet te staan
  if (typeof r.percentage !== "number") return null;
  const u = leesRespons({ percentage: r.percentage, bron: r.bron });
  return u.ok ? u.waarde : null;
}

/** Het aantal klanten of gasten per maand dat de bezoeker typt: 1 tot 1.000.000, met of zonder punten ertussen. */
export function leesKlanten(ruw: unknown): number | null {
  if (typeof ruw !== "string") return null;
  const t = ruw.trim();
  // alleen cijfers, of nette groepen van drie ("1.000", "12 500", "1,000,000"); "1.5" is geen aantal
  if (!/^\d{1,7}$/.test(t) && !/^\d{1,3}(?:[.,\s]\d{3}){1,2}$/.test(t)) return null;
  const n = Number(t.replace(/[.,\s]/g, ""));
  return Number.isInteger(n) && n >= KLANTEN_MIN && n <= KLANTEN_MAX ? n : null;
}

/**
 * De schatting: klanten × percentage, naar beneden afgerond. Zonder geldig percentage of aantal is er geen uitkomst
 * (null): de rekenhulp rekent nooit met een aangenomen waarde.
 */
export function verwachteReacties(klanten: unknown, percentage: unknown): number | null {
  if (typeof klanten !== "number" || !Number.isInteger(klanten) || klanten < KLANTEN_MIN || klanten > KLANTEN_MAX) return null;
  if (typeof percentage !== "number" || !Number.isInteger(percentage) || percentage < RESPONS_MIN || percentage > RESPONS_MAX) return null;
  return Math.floor((klanten * percentage) / 100);
}

/** "12.500" of "12,500": een heel getal met het teken van de taal tussen de duizendtallen. */
export const groepeer = (n: number, teken: string) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, teken);
