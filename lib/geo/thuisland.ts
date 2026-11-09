// ---------------------------------------------------------------------------
// Het land van de thuisbasis van een werker (onboarding). Puur bestand: de
// server (lib/geo/thuisbasis.ts, de onboarding-routes) en het formulier
// (components/app/ThuisbasisVelden.tsx) delen deze lijst en de postcoderegel.
//
// Let op: dit is alleen het land van het woonadres, voor de reisafstand. Het is
// NIET het fiscale land (FreelancerProfile.country): dat bepaalt de btw op de
// selfbilling-facturen (lib/billing/self-billing.ts) en komt uit het
// btw-nummer (VIES). Die twee horen niet door elkaar te lopen.
// ---------------------------------------------------------------------------

/** EU, EER, Zwitserland en het Verenigd Koninkrijk (ISO 3166-1 alpha-2); Nederland eerst. */
export const THUISLANDEN = [
  "NL", "BE", "DE", "LU", "FR", "AT", "CH", "LI", "DK", "SE", "NO", "FI", "IS", "IE", "GB",
  "PL", "CZ", "SK", "HU", "SI", "HR", "RO", "BG", "LT", "LV", "EE",
  "ES", "PT", "IT", "MT", "GR", "CY",
] as const;

export type Thuisland = (typeof THUISLANDEN)[number];

export function isThuisland(v: unknown): v is Thuisland {
  return typeof v === "string" && (THUISLANDEN as readonly string[]).includes(v);
}

const NL_POSTCODE = /^\d{4}\s*[A-Za-z]{2}$/;
/** Buitenland: 2 tot 12 letters of cijfers, met hooguit spaties of streepjes ertussen. */
const BUITEN_POSTCODE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,10}[A-Za-z0-9]$/;

export function postcodeGeldig(land: string, postcode: string): boolean {
  const p = postcode.trim();
  return land === "NL" ? NL_POSTCODE.test(p) : BUITEN_POSTCODE.test(p);
}

/** Melding bij een ongeldige postcode (server; het formulier controleert eerst zelf). */
export function postcodeMelding(land: string): string {
  return land === "NL" ? "Gebruik een geldige postcode, bijv. 1012 AB" : "Vul een geldige postcode in (2 tot 12 letters of cijfers)";
}

/**
 * Zo bewaren we de postcode van een thuisbasis in het buitenland: met de
 * landcode ervoor ("BE-2000"), zodat "2000" nergens voor een Nederlandse
 * postcode wordt aangezien. Nederland houdt de vorm die PDOK teruggeeft.
 */
export function buitenlandPostcode(land: string, postcode: string): string {
  return `${land}-${postcode.trim().replace(/\s+/g, " ").toUpperCase()}`;
}

/**
 * Welke thuisbasis-fout gaf de server (`error.details.reden`, lib/geo/thuisbasis.ts)?
 * Het formulier toont dan de tekst in de taal van de werker in plaats van de Nederlandse melding.
 */
export function thuisbasisReden(antwoord: unknown): "nietGevonden" | "onbereikbaar" | null {
  const reden = (antwoord as { error?: { details?: { reden?: unknown } } } | null)?.error?.details?.reden;
  if (reden === "thuisbasis-niet-gevonden") return "nietGevonden";
  if (reden === "thuisbasis-onbereikbaar") return "onbereikbaar";
  return null;
}

/** Grof gebied voor een opdrachtgever: in NL de vier cijfers, in het buitenland de hele bewaarde postcode. */
export function gebiedVan(homePostalCode: string | null | undefined): string | null {
  const p = homePostalCode?.trim();
  if (!p) return null;
  return /^[A-Z]{2}-/.test(p) ? p : p.replace(/\s/g, "").slice(0, 4);
}
