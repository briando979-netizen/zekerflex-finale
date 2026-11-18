// ---------------------------------------------------------------------------
// Levertijd eerlijk (18 nov 2026). Eigen voorraad gaat op werkdagen vóór 22:00 nog dezelfde dag
// weg (lib/shop/bezorgmoment.ts); een verkoper verstuurt binnen 2 werkdagen; een product van de
// leverancier (CJ Dropshipping) komt uit een magazijn in Duitsland of China en doet er dagen over.
// Dat laatste stond nergens: de kaart zei "morgen in huis". Puur bestand, ook voor de browser.
// ---------------------------------------------------------------------------

export type Herkomst = "eigen" | "verkoper" | "leverancier";

/** onze variant-sku's van CJ beginnen hiermee (lib/shop/cj/cj-core.ts onzeSku) */
const CJ_SKU = "cj-";

/** Waar een product vandaan komt, af te lezen aan de verkoper en de sku's van de varianten. */
export function herkomstVan(p: { seller?: string | null | undefined; variants?: readonly { sku?: string | null | undefined }[] | undefined }): Herkomst {
  if (p.seller) return "verkoper";
  if (p.variants?.some((v) => typeof v.sku === "string" && v.sku.startsWith(CJ_SKU))) return "leverancier";
  return "eigen";
}

/** Ruime termijnen per magazijn (kalenderdagen) als CJ geen eigen termijn gaf. */
export const LEVERTIJD_STANDAARD: Readonly<Record<string, readonly [number, number]>> = Object.freeze({ DE: [3, 7], CN: [7, 15] });

/**
 * "6-12", "6~12", "6 - 12 days" of "10" → [6, 12]; onzin of niets → de standaard van het magazijn ("DE" of anders "CN").
 * Begrensd op 1 tot 60 dagen; een omgekeerd bereik wordt rechtgezet.
 */
export function levertijdDagen(aging: string | null | undefined, magazijn?: string | null): [number, number] {
  const m = typeof aging === "string" ? aging.match(/(\d{1,2})\s*(?:[-~–]|tot|to)\s*(\d{1,2})|(\d{1,2})/) : null;
  if (m) {
    const a = Number(m[1] ?? m[3]);
    const b = Number(m[2] ?? m[3]);
    if (a >= 1 && b >= 1 && a <= 60 && b <= 60) return a <= b ? [a, b] : [b, a];
  }
  const std = LEVERTIJD_STANDAARD[(magazijn ?? "").toUpperCase()] ?? LEVERTIJD_STANDAARD.CN!;
  return [std[0], std[1]];
}

/** "6-12" of "7" voor in een zin ("levertijd {dagen} dagen"). */
export function levertijdBereik(dagen: readonly [number, number]): string {
  return dagen[0] === dagen[1] ? String(dagen[0]) : `${dagen[0]}-${dagen[1]}`;
}

/** De termijn zoals de pagina hem meekrijgt ("6-12"); uit CJ's eigen termijn of de standaard van het magazijn. */
export function levertijdVoorLeverancier(aging: string | null | undefined, magazijn?: string | null): string {
  return levertijdBereik(levertijdDagen(aging, magazijn));
}

/**
 * De termijn voor een hele bestelling: de ruimste van de regels ("3-7" en "7-15" → "7-15"), want het pakket is er pas als
 * het laatste product er is. Null zonder termijnen (geen leveranciersproduct in de bestelling).
 */
export function langsteLevertijd(termijnen: readonly string[]): string | null {
  let beste: { tekst: string; tot: number; van: number } | null = null;
  for (const t of termijnen) {
    const m = /^\s*(\d+)(?:\s*[-~]\s*(\d+))?/.exec(t);
    if (!m) continue;
    const van = Number(m[1]);
    const tot = Number(m[2] ?? m[1]);
    if (!beste || tot > beste.tot || (tot === beste.tot && van < beste.van)) beste = { tekst: t.trim(), tot, van }; // gelijk eind: het bereik ("3-7") boven het losse getal ("7")
  }
  return beste?.tekst ?? null;
}
