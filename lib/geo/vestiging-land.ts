// ---------------------------------------------------------------------------
// Het land van een werklocatie (vaste vestiging of eenmalige klus-locatie). Standaard alleen Nederland, zoals altijd. Met
// de vlag `werk-in-belgie` komt België erbij, met `werk-in-buitenland` elk land (beide standaard uit, lib/flags). Puur
// bestand: de formulieren (components/werkgever/VestigingFormulier.tsx, components/app/NewShiftForm.tsx), de server en de
// tests delen het, zonder prisma of netwerk.
//
// Branch heeft geen kolom voor het land, en een migratie wilden we niet: het land staat in de postcode. Buiten Nederland
// bewaren we de postcode met de landcode ervoor ("BE-2000", "DE-10115"), precies zoals de thuisbasis van een werker in het
// buitenland (buitenlandPostcode in lib/geo/thuisland.ts), zodat werker en werklocatie dezelfde taal spreken. Een land
// zonder postcodes krijgt alleen de landcode met het streepje ("AE-"). Bewust niet de kale postcode: een eenmalige locatie
// in Nederland heeft soms ook alleen "3511", en PDOK zou "2000" in Haarlem zoeken. Zonder landcode is het Nederland.
// ---------------------------------------------------------------------------

import { buitenlandPostcode } from "@/lib/geo/thuisland";
import { landNaam } from "@/lib/werkrecht/landen";

/** De vlaggen in lib/flags (standaard uit). Hier, zodat een formulier ze kan noemen zonder de KV-opslag mee te nemen. */
export const WERK_IN_BELGIE_VLAG = "werk-in-belgie";
export const WERK_IN_BUITENLAND_VLAG = "werk-in-buitenland";

/** Een landcode (ISO 3166-1 alpha-2), bijvoorbeeld "NL", "BE" of "DE". */
export type VestigingLand = string;

/** Altijd vooraan, in deze volgorde. */
const VOORAAN = ["NL", "BE", "DE", "LU", "FR"] as const;

/** De rest van de EU en de EER (IJsland, Liechtenstein, Noorwegen), na de vijf hierboven. */
const EU_EER = [
  "AT", "BG", "CY", "CZ", "DK", "EE", "ES", "FI", "GR", "HR", "HU", "IE", "IT", "LT", "LV", "MT", "PL", "PT", "RO", "SE", "SI", "SK",
  "IS", "LI", "NO",
] as const;

/** Alle andere landen en gebieden met inwoners (ISO 3166-1); onbewoonde gebieden (Antarctica, Bouveteiland, …) staan er niet in. */
const OVERIG = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AS", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BF", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX",
  "DJ", "DM", "DO", "DZ", "EC", "EG", "EH", "ER", "ET", "FJ", "FK", "FM", "FO",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GT", "GU", "GW", "GY",
  "HK", "HN", "HT", "ID", "IL", "IM", "IN", "IQ", "IR", "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LK", "LR", "LS", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NP", "NR", "NU", "NZ", "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PM", "PN", "PR", "PS", "PW", "PY", "QA", "RE", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SG", "SH", "SJ", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

const ALLE = new Set<string>([...VOORAAN, ...EU_EER, ...OVERIG]);

/**
 * Landen zonder (gangbare) postcode: daar is het veld niet verplicht en zoeken we op straat en plaats. Liever een land te
 * veel in deze lijst dan een bedrijf dat vastloopt op een veld dat niet bestaat; wie toch een code heeft, mag hem invullen.
 */
const ZONDER_POSTCODE = new Set<string>([
  "AE", "AG", "AO", "AW", "BF", "BI", "BJ", "BO", "BQ", "BS", "BW", "BZ", "CD", "CF", "CG", "CI", "CK", "CM", "CW", "DJ", "DM",
  "ER", "FJ", "GA", "GD", "GH", "GM", "GQ", "GY", "HK", "JM", "KI", "KM", "KN", "KP", "LY", "ML", "MO", "MR", "MW", "NR", "NU",
  "QA", "RW", "SB", "SC", "SL", "SO", "SR", "SS", "ST", "SX", "SY", "TD", "TG", "TK", "TL", "TO", "TV", "UG", "VU", "YE", "ZW",
]);

export function isVestigingLand(v: unknown): v is VestigingLand {
  return typeof v === "string" && ALLE.has(v);
}

/** Heeft dit land postcodes? Zo niet, dan is het veld niet verplicht. */
export function heeftPostcode(land: string): boolean {
  return !ZONDER_POSTCODE.has(land);
}

/** Welke landen een bedrijf mag kiezen: alleen Nederland (zoals altijd), Nederland en België, of elk land. */
export function werklocatieLanden(stand: { belgie: boolean; buitenland: boolean }): readonly string[] {
  if (stand.buitenland) return [...VOORAAN, ...EU_EER, ...OVERIG];
  if (stand.belgie) return ["NL", "BE"];
  return ["NL"];
}

/** Eén keuze in de lijst: de code en de naam in de taal van de lezer. */
export interface LandKeuze {
  code: string;
  naam: string;
}

/**
 * De keuzelijst, met de namen via Intl in de taal van de lezer: Nederland, België, Duitsland, Luxemburg en Frankrijk
 * bovenaan, daarna de rest van de EU en de EER op naam, daarna alle andere landen op naam. Op de server maken en als
 * kant-en-klare lijst aan het formulier geven: de namen van Intl kunnen in een browser net anders zijn, en dan klopt de
 * pagina na het laden niet meer met wat de server stuurde.
 */
export function landKeuzes(landen: readonly string[], locale: string): LandKeuze[] {
  const sorteer = (codes: readonly string[]): LandKeuze[] => {
    const lijst = codes.map((code) => ({ code, naam: landNaam(code, locale) }));
    let vergelijk: (a: string, b: string) => number;
    try {
      vergelijk = new Intl.Collator(locale).compare;
    } catch {
      vergelijk = (a, b) => a.localeCompare(b);
    }
    return lijst.sort((a, b) => vergelijk(a.naam, b.naam));
  };
  const mag = new Set(landen);
  const vooraan = VOORAAN.filter((c) => mag.has(c)).map((code) => ({ code, naam: landNaam(code, locale) }));
  return [...vooraan, ...sorteer(EU_EER.filter((c) => mag.has(c))), ...sorteer(OVERIG.filter((c) => mag.has(c)))];
}

// --- postcodes ---------------------------------------------------------------------------------------------------------

const NL_POSTCODE = /^\d{4}\s*[A-Za-z]{2}$/;
/** België: vier cijfers van 1000 tot en met 9999. "B-2000", "BE-2000" en "BE 2000" mogen ook. */
const BE_POSTCODE = /^(?:BE?\s*-?\s*)?([1-9]\d{3})$/i;
/** Elders: 1 tot 10 letters, cijfers, spaties of streepjes, beginnend en eindigend met een letter of cijfer. Of het adres bestaat, beslist OpenStreetMap. */
const BUITEN_POSTCODE = /^[A-Z0-9](?:[A-Z0-9 -]{0,8}[A-Z0-9])?$/;

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

/**
 * Ligt deze Belgische postcode in Vlaanderen? In Brussel en Wallonië heeft een plaatsingsbureau eerst een registratie of
 * aangifte nodig, in Vlaanderen niet (zekerflex-administratie/belgie/spec-belgie.md, hoofdstuk 3). Dus voorlopig alleen
 * Vlaanderen: 1500–3999 (Vlaams-Brabant, Antwerpen, Limburg) en 8000–9999 (West- en Oost-Vlaanderen). Niet: 1000–1299
 * (Brussel), 1300–1499 (Waals-Brabant) en 4000–7999 (Luik, Namen, Henegouwen, Luxemburg). Geldt alleen voor België.
 */
export function isVlaamsePostcode(postcode: string): boolean {
  const pc = belgischePostcode(postcode);
  if (!pc) return false;
  const n = Number(pc);
  return (n >= 1500 && n <= 3999) || (n >= 8000 && n <= 9999);
}

/** De melding bij een Belgische postcode buiten Vlaanderen (server; het formulier toont buitenlandNietVlaanderen). */
export const NIET_VLAANDEREN_MELDING = "Brussel en Wallonië volgen later; nu kan een werklocatie in België alleen in Vlaanderen.";

/** Welk land past bij een ingetypte postcode? "1012 AB" is Nederland, "2000" België; iets anders null. */
export function herkenLand(postcode: string): "NL" | "BE" | null {
  if (isNederlandsePostcode(postcode)) return "NL";
  if (isBelgischePostcode(postcode)) return "BE";
  return null;
}

/**
 * Een ingetypte postcode buiten Nederland, netjes ("10115", "SW1A 1AA"): België vier cijfers, elders 1 tot 10 tekens.
 * Leeg geeft "" (alleen goed in een land zonder postcodes, zie heeftPostcode); ongeldig geeft null.
 */
export function buitenlandsePostcode(land: string, postcode: string): string | null {
  const p = postcode.trim().replace(/\s+/g, " ").toUpperCase();
  if (!p) return "";
  if (land === "BE") return belgischePostcode(p);
  return BUITEN_POSTCODE.test(p) ? p : null;
}

/** Zo gaat een postcode buiten Nederland de database in: "BE-2000", of "AE-" in een land zonder postcode. Null als hij niet klopt. */
export function opslagPostcode(land: string, postcode: string): string | null {
  const p = buitenlandsePostcode(land, postcode);
  return p === null ? null : buitenlandPostcode(land, p);
}

/** Zo gaat een Belgische postcode de database in: "BE-2000". Null als het geen Belgische postcode is. */
export function belgischeOpslagPostcode(postcode: string): string | null {
  const pc = belgischePostcode(postcode);
  return pc ? buitenlandPostcode("BE", pc) : null;
}

const OPGESLAGEN = /^([A-Z]{2})-(.*)$/;

/** Het buitenlandse land en de postcode uit een opgeslagen waarde, of null voor Nederland. */
function opgeslagen(postalCode: string | null | undefined): { land: string; postcode: string } | null {
  const m = OPGESLAGEN.exec((postalCode ?? "").trim());
  const land = m?.[1];
  if (!land || land === "NL" || !ALLE.has(land)) return null;
  return { land, postcode: m?.[2] ?? "" };
}

/** Het land van een opgeslagen werklocatie: "BE-2000" is België, "DE-10115" Duitsland, al het andere Nederland (zoals altijd). */
export function landVanVestiging(postalCode: string | null | undefined): VestigingLand {
  return opgeslagen(postalCode)?.land ?? "NL";
}

/** De postcode zoals een mens hem leest: "BE-2000" wordt "2000", "AE-" leeg; een Nederlandse blijft precies zoals hij was. */
export function postcodeTekst(postalCode: string): string {
  return opgeslagen(postalCode)?.postcode ?? postalCode;
}

/**
 * Het land achter een adresregel, alleen bij een werklocatie buiten Nederland: "Meir 1, 2000 Antwerpen, België" (de
 * landnaam in de taal van de lezer, via Intl). Een Nederlandse regel blijft precies zoals hij was.
 */
export function metLand(regel: string, postalCode: string | null | undefined, locale: string): string {
  const land = landVanVestiging(postalCode);
  if (land === "NL") return regel;
  const naam = landNaam(land, locale);
  return regel.trim() ? `${regel}, ${naam}` : naam;
}

/** "2000 Antwerpen, België" buiten Nederland; Nederland "1012 AB Amsterdam", zonder land. */
export function plaatsRegel(v: { postalCode: string | null | undefined; city: string }, locale: string): string {
  const pc = v.postalCode ? postcodeTekst(v.postalCode) : "";
  return metLand(`${pc} ${v.city}`.trim(), v.postalCode, locale);
}

/**
 * Postcode en plaats in een adresregel (agenda, kilometers, bureau): in Nederland precies `${postcode} ${plaats}` zoals
 * die plekken het altijd schreven, buiten Nederland "2000 Antwerpen, België".
 */
export function postcodePlaats(v: { postalCode: string | null | undefined; city: string }, locale: string): string {
  return landVanVestiging(v.postalCode) === "NL" ? `${v.postalCode ?? ""} ${v.city}` : plaatsRegel(v, locale);
}

/**
 * De servercontrole van de postcode van een werklocatie (POST en PATCH /api/werkgever/branches, de eenmalige locatie bij
 * een klus). Zonder landcode: Nederland, 4 tot 12 tekens, zoals altijd. Met landcode: alleen een land dat dit bedrijf mag
 * kiezen (de vlaggen), en een postcode die bij dat land past. Geeft de waarde terug zoals hij bewaard wordt.
 */
export function controleerVestigingPostcode(
  postalCode: string,
  landen: readonly string[],
): { ok: true; postalCode: string } | { ok: false; melding: string; /** de postcode heeft een buitenlandse landcode */ buitenland: boolean } {
  const p = postalCode.trim();
  const m = /^([A-Za-z]{2})-(.*)$/.exec(p);
  const land = (m?.[1] ?? "").toUpperCase();
  // geen (bekende, buitenlandse) landcode ervoor: Nederland, met precies de oude regel (4 tot 12 tekens, zoals ingevuld)
  if (!m || land === "NL" || !ALLE.has(land)) {
    return p.length >= 4 && p.length <= 12 ? { ok: true, postalCode: p } : { ok: false, melding: "Gebruik een geldige postcode.", buitenland: false };
  }
  if (!landen.includes(land)) return { ok: false, melding: "Werklocaties in dit land staan nog niet aan.", buitenland: true };
  const pc = buitenlandsePostcode(land, m[2] ?? "");
  if (pc === null || (pc === "" && heeftPostcode(land))) return { ok: false, melding: "Gebruik een geldige postcode voor dit land.", buitenland: true };
  if (land === "BE" && !isVlaamsePostcode(pc)) return { ok: false, melding: NIET_VLAANDEREN_MELDING, buitenland: true };
  return { ok: true, postalCode: buitenlandPostcode(land, pc) };
}

// --- het formulier (components/werkgever/BuitenlandAdres.tsx) en /api/werkgever/adres-buitenland ----------------------

/** Een adres buiten Nederland zoals /api/werkgever/adres-buitenland het teruggeeft (OpenStreetMap, lib/geo/vestiging-buitenland.ts). */
export interface GevondenBuitenlandsAdres {
  /** "Meir 1, 2000 Antwerpen" */
  label: string;
  lat: number;
  lng: number;
  /** straat en huisnummer */
  straat: string;
  /** zo bewaard: "BE-2000", of "AE-" zonder postcode */
  postcode: string;
  plaats: string;
}

/** Leest `result` van /api/werkgever/adres-buitenland; onbruikbaar (of geen postcode met een buitenlandse landcode) geeft null. */
export function leesGevondenBuitenlandsAdres(v: unknown): GevondenBuitenlandsAdres | null {
  const r = v as Record<string, unknown> | null | undefined;
  if (!r || typeof r.label !== "string" || typeof r.straat !== "string" || typeof r.postcode !== "string") return null;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || landVanVestiging(r.postcode) === "NL") return null;
  return { label: r.label, lat, lng, straat: r.straat, postcode: r.postcode, plaats: typeof r.plaats === "string" ? r.plaats : "" };
}

/** De sleutels in de teksten van het formulier (lib/i18n/dictionaries.ts → vestigingForm) voor een melding. */
export type BuitenlandMelding =
  | "buitenlandStraat"
  | "buitenlandPostcode"
  | "buitenlandPostcodeBE"
  | "buitenlandNlPostcode"
  | "buitenlandPlaats"
  | "buitenlandNietVlaanderen"
  | "buitenlandNietGevonden"
  | "buitenlandOnbereikbaar";

/** Wat er vóór het zoeken al niet klopt (het formulier zegt het meteen, zonder vraag naar buiten), of null. */
export function buitenlandInvoerMelding(land: string, v: { straat: string; postcode: string; plaats: string }): BuitenlandMelding | null {
  if (land === "BE" && herkenLand(v.postcode) === "NL") return "buitenlandNlPostcode";
  const s = v.straat.trim();
  if (s.length < 3 || !/\d/.test(s)) return "buitenlandStraat";
  const pc = buitenlandsePostcode(land, v.postcode);
  if (pc === null || (pc === "" && heeftPostcode(land))) return land === "BE" ? "buitenlandPostcodeBE" : "buitenlandPostcode";
  if (land === "BE" && !isVlaamsePostcode(pc)) return "buitenlandNietVlaanderen";
  // zonder postcode zoeken we op straat en plaats: dan is de plaats nodig
  if (pc === "" && v.plaats.trim().length < 2) return "buitenlandPlaats";
  return null;
}

/** Welke melding hoort bij de fout van de server (`error.details.reden`)? Iets anders geeft null: dan de tekst van de server. */
export function buitenlandFoutMelding(antwoord: unknown, land: string): BuitenlandMelding | null {
  const reden = (antwoord as { error?: { details?: { reden?: unknown } } } | null)?.error?.details?.reden;
  if (reden === "buitenland-straat") return "buitenlandStraat";
  if (reden === "buitenland-postcode") return land === "BE" ? "buitenlandPostcodeBE" : "buitenlandPostcode";
  if (reden === "buitenland-plaats") return "buitenlandPlaats";
  if (reden === "buitenland-vlaanderen") return "buitenlandNietVlaanderen";
  if (reden === "buitenland-niet-gevonden") return "buitenlandNietGevonden";
  if (reden === "buitenland-onbereikbaar") return "buitenlandOnbereikbaar";
  return null;
}
