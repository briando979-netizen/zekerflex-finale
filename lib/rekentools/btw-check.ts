// ---------------------------------------------------------------------------
// Btw-nummer- en KVK-check (4 nov 2026): de gratis rekentool op
// /rekentools/btw-nummer-check. Puur bestand (ook in de browser): wat iemand
// intypt herkennen, netjes maken en de uitkomst in gewone taal zetten. De
// echte controle van een btw-id doet de server bij VIES (lib/integrations/vies.ts);
// een KVK-nummer controleren we op vorm en linken we naar het Handelsregister.
// ---------------------------------------------------------------------------

export type Soort = "btw" | "kvk" | "onbekend";

const EU = new Set(["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI"]);

export interface Invoer {
  soort: Soort;
  /** netjes gemaakt: "NL001234567B01" of "12345678" */
  waarde: string;
  landcode?: string;
}

/** Herkent wat er is ingetypt: een EU-btw-id (landcode + nummer) of een Nederlands KVK-nummer (8 cijfers). */
export function leesInvoer(s: string): Invoer {
  const t = s.replace(/[\s.\-]/g, "").toUpperCase().replace(/^GR/, "EL");
  if (/^\d{8}$/.test(t)) return { soort: "kvk", waarde: t };
  const m = /^([A-Z]{2})([A-Z0-9]{2,12})$/.exec(t);
  if (m && EU.has(m[1]!)) return { soort: "btw", waarde: `${m[1]}${m[2]}`, landcode: m[1]! };
  // alleen cijfers met een B erin: iemand vergat NL
  const nl = /^(\d{9})B(\d{2})$/.exec(t);
  if (nl) return { soort: "btw", waarde: `NL${nl[1]}B${nl[2]}`, landcode: "NL" };
  return { soort: "onbekend", waarde: t };
}

/** Een Nederlands btw-id heeft altijd deze vorm: NL + 9 cijfers + B + 2 cijfers. */
export function nlBtwVormKlopt(waarde: string): boolean {
  return /^NL\d{9}B\d{2}$/.test(waarde);
}

export const LANDEN: Record<string, string> = {
  AT: "Oostenrijk", BE: "België", BG: "Bulgarije", CY: "Cyprus", CZ: "Tsjechië", DE: "Duitsland", DK: "Denemarken", EE: "Estland", EL: "Griekenland", ES: "Spanje", FI: "Finland", FR: "Frankrijk", HR: "Kroatië", HU: "Hongarije", IE: "Ierland", IT: "Italië", LT: "Litouwen", LU: "Luxemburg", LV: "Letland", MT: "Malta", NL: "Nederland", PL: "Polen", PT: "Portugal", RO: "Roemenië", SE: "Zweden", SI: "Slovenië", SK: "Slowakije", XI: "Noord-Ierland",
};

export type ViesStatus = "valid" | "invalid" | "malformed" | "unavailable";

/** De uitkomst van VIES in gewone taal. */
export function uitlegBtw(status: ViesStatus, landcode: string): { kop: string; tekst: string; toon: "ok" | "warn" | "crit" } {
  const land = LANDEN[landcode] ?? landcode;
  switch (status) {
    case "valid":
      return { kop: "Geldig btw-nummer", tekst: `Dit btw-nummer staat als actief geregistreerd in ${land} (gecontroleerd bij VIES van de Europese Commissie).`, toon: "ok" };
    case "invalid":
      return { kop: "Niet gevonden", tekst: `VIES kent dit nummer niet als actief btw-nummer in ${land}. Controleer de cijfers, of vraag de ondernemer om het juiste nummer. Een pas aangevraagd nummer kan een paar dagen later zichtbaar worden.`, toon: "crit" };
    case "unavailable":
      return { kop: "Even niet te controleren", tekst: `De dienst van ${land} antwoordt op dit moment niet. Dat zegt niets over het nummer. Probeer het over een paar minuten opnieuw.`, toon: "warn" };
    default:
      return { kop: "Geen geldig btw-nummer", tekst: "Dit lijkt niet op een EU-btw-nummer. Een Nederlands btw-id is NL + 9 cijfers + B + 2 cijfers, bijvoorbeeld NL001234567B01.", toon: "crit" };
  }
}

/** Zoeklink in het Handelsregister van de KVK. */
export const kvkZoekLink = (kvk: string): string => `https://www.kvk.nl/zoeken/handelsregister/?kvknummer=${encodeURIComponent(kvk)}`;

/** Link naar de VIES-pagina van de Europese Commissie (om het zelf na te kijken). */
export const viesLink = "https://ec.europa.eu/taxation_customs/vies/";
