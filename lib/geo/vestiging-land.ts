// ---------------------------------------------------------------------------
// Het land van een werklocatie (vaste vestiging of eenmalige klus-locatie): Nederland, of België achter de vlag
// `werk-in-belgie` (standaard uit, lib/flags). Puur bestand: de formulieren (components/werkgever/VestigingFormulier.tsx,
// components/app/NewShiftForm.tsx), de server en de tests delen het, zonder prisma of netwerk.
//
// Branch heeft geen kolom voor het land, en een migratie wilden we niet: het land staat in de postcode. Een Belgische
// postcode bewaren we met de landcode ervoor ("BE-2000"), net als de thuisbasis van een werker in het buitenland
// (buitenlandPostcode in lib/geo/thuisland.ts). Bewust niet de kale vier cijfers: een eenmalige locatie in Nederland heeft
// soms ook alleen "3511", en PDOK zou "2000" in Haarlem zoeken. Wat geen "BE-" heeft, blijft Nederland, zoals altijd.
// ---------------------------------------------------------------------------

import { buitenlandPostcode } from "@/lib/geo/thuisland";
import { landNaam } from "@/lib/werkrecht/landen";

/** De vlag in lib/flags (standaard uit). Hier, zodat een formulier hem kan noemen zonder de KV-opslag mee te nemen. */
export const WERK_IN_BELGIE_VLAG = "werk-in-belgie";

export const VESTIGING_LANDEN = ["NL", "BE"] as const;
export type VestigingLand = (typeof VESTIGING_LANDEN)[number];

export function isVestigingLand(v: unknown): v is VestigingLand {
  return v === "NL" || v === "BE";
}

const NL_POSTCODE = /^\d{4}\s*[A-Za-z]{2}$/;
/** België: vier cijfers van 1000 tot en met 9999. "B-2000", "BE-2000" en "BE 2000" mogen ook. */
const BE_POSTCODE = /^(?:BE?\s*-?\s*)?([1-9]\d{3})$/i;

export function isNederlandsePostcode(postcode: string): boolean {
  return NL_POSTCODE.test(postcode.trim());
}

/** "2000", "B-2000" of "be 2000" wordt "2000"; geen Belgische postcode geeft null. */
export function belgischePostcode(postcode: string): string | null {
  return BE_POSTCODE.exec(postcode.trim())?.[1] ?? null;
}

export function isBelgischePostcode(postcode: string): boolean {
  return belgischePostcode(postcode) !== null;
}

/** Welk land past bij een ingetypte postcode? "1012 AB" is Nederland, "2000" België; iets anders null. */
export function herkenLand(postcode: string): VestigingLand | null {
  if (isNederlandsePostcode(postcode)) return "NL";
  if (isBelgischePostcode(postcode)) return "BE";
  return null;
}

/** Zo gaat een Belgische postcode de database in: "BE-2000". Null als het geen Belgische postcode is. */
export function belgischeOpslagPostcode(postcode: string): string | null {
  const pc = belgischePostcode(postcode);
  return pc ? buitenlandPostcode("BE", pc) : null;
}

const OPGESLAGEN_BE = /^BE-(\d{4})$/;

/** Het land van een opgeslagen werklocatie: "BE-2000" is België, al het andere Nederland (zoals altijd). */
export function landVanVestiging(postalCode: string | null | undefined): VestigingLand {
  return OPGESLAGEN_BE.test((postalCode ?? "").trim()) ? "BE" : "NL";
}

/** De postcode zoals een mens hem leest: "BE-2000" wordt "2000"; een Nederlandse blijft precies zoals hij was. */
export function postcodeTekst(postalCode: string): string {
  return OPGESLAGEN_BE.exec(postalCode.trim())?.[1] ?? postalCode;
}

/**
 * Het land achter een adresregel, alleen bij een Belgische werklocatie: "Meir 1, 2000 Antwerpen, België" (de landnaam in
 * de taal van de lezer, via Intl). Een Nederlandse regel blijft precies zoals hij was.
 */
export function metLand(regel: string, postalCode: string | null | undefined, locale: string): string {
  if (landVanVestiging(postalCode) !== "BE") return regel;
  const land = landNaam("BE", locale);
  return regel.trim() ? `${regel}, ${land}` : land;
}

/** "2000 Antwerpen, België" voor een Belgische werklocatie; Nederland "1012 AB Amsterdam", zonder land. */
export function plaatsRegel(v: { postalCode: string | null | undefined; city: string }, locale: string): string {
  const pc = v.postalCode ? postcodeTekst(v.postalCode) : "";
  return metLand(`${pc} ${v.city}`.trim(), v.postalCode, locale);
}

// --- het formulier (components/werkgever/BelgischAdres.tsx) en /api/werkgever/adres-belgie --------------------------

/** Een Belgisch adres zoals /api/werkgever/adres-belgie het teruggeeft (OpenStreetMap, lib/geo/vestiging-belgie.ts). */
export interface GevondenBelgischAdres {
  /** "Meir 1, 2000 Antwerpen" */
  label: string;
  lat: number;
  lng: number;
  /** straat en huisnummer */
  straat: string;
  /** zo bewaard: "BE-2000" */
  postcode: string;
  plaats: string;
}

/** Leest `result` van /api/werkgever/adres-belgie; onbruikbaar (of geen Belgische postcode) geeft null. */
export function leesGevondenBelgischAdres(v: unknown): GevondenBelgischAdres | null {
  const r = v as Record<string, unknown> | null | undefined;
  if (!r || typeof r.label !== "string" || typeof r.straat !== "string" || typeof r.postcode !== "string") return null;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || landVanVestiging(r.postcode) !== "BE") return null;
  return { label: r.label, lat, lng, straat: r.straat, postcode: r.postcode, plaats: typeof r.plaats === "string" ? r.plaats : "" };
}

/** De sleutels in de teksten van het formulier (lib/i18n/dictionaries.ts → vestigingForm) voor een melding. */
export type BelgieMelding = "belgieStraat" | "belgiePostcode" | "belgieNlPostcode" | "belgieNietGevonden" | "belgieOnbereikbaar";

/** Wat er vóór het zoeken al niet klopt (het formulier zegt het meteen, zonder vraag naar buiten), of null. */
export function belgieInvoerMelding(straat: string, postcode: string): BelgieMelding | null {
  if (herkenLand(postcode) === "NL") return "belgieNlPostcode";
  const s = straat.trim();
  if (s.length < 3 || !/\d/.test(s)) return "belgieStraat";
  if (!isBelgischePostcode(postcode)) return "belgiePostcode";
  return null;
}

/** Welke melding hoort bij de fout van de server (`error.details.reden`)? Iets anders geeft null: dan de tekst van de server. */
export function belgieFoutMelding(antwoord: unknown): BelgieMelding | null {
  const reden = (antwoord as { error?: { details?: { reden?: unknown } } } | null)?.error?.details?.reden;
  if (reden === "belgie-straat") return "belgieStraat";
  if (reden === "belgie-postcode") return "belgiePostcode";
  if (reden === "belgie-niet-gevonden") return "belgieNietGevonden";
  if (reden === "belgie-onbereikbaar") return "belgieOnbereikbaar";
  return null;
}
