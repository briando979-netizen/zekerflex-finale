// Een buitenlands bedrijf dat zich aanmeldt als opdrachtgever: welk land, welk nummer erbij hoort en
// wat er mis kan zijn aan de invoer. Puur bestand (geen prisma, geen zod), dus ook bruikbaar in het scherm.
// Nederland blijft de standaard en loopt via het KVK-nummer zoals voorheen.

export type LandSoort = "NL" | "EU" | "BUITEN";

export interface LandKeuze {
  code: string;
  naam: string;
}

/** Landen in de Europese Unie behalve Nederland: hier hoort een btw-nummer bij dat in VIES staat. */
export const EU_LANDEN: LandKeuze[] = [
  { code: "AT", naam: "Oostenrijk" },
  { code: "BE", naam: "België" },
  { code: "BG", naam: "Bulgarije" },
  { code: "HR", naam: "Kroatië" },
  { code: "CY", naam: "Cyprus" },
  { code: "CZ", naam: "Tsjechië" },
  { code: "DK", naam: "Denemarken" },
  { code: "EE", naam: "Estland" },
  { code: "FI", naam: "Finland" },
  { code: "FR", naam: "Frankrijk" },
  { code: "DE", naam: "Duitsland" },
  { code: "GR", naam: "Griekenland" },
  { code: "HU", naam: "Hongarije" },
  { code: "IE", naam: "Ierland" },
  { code: "IT", naam: "Italië" },
  { code: "LV", naam: "Letland" },
  { code: "LT", naam: "Litouwen" },
  { code: "LU", naam: "Luxemburg" },
  { code: "MT", naam: "Malta" },
  { code: "PL", naam: "Polen" },
  { code: "PT", naam: "Portugal" },
  { code: "RO", naam: "Roemenië" },
  { code: "SK", naam: "Slowakije" },
  { code: "SI", naam: "Slovenië" },
  { code: "ES", naam: "Spanje" },
  { code: "SE", naam: "Zweden" },
];

/** Landen buiten de EU die vaak voorkomen, plus "ander land". Daar vragen we een gewoon registratienummer. */
export const BUITEN_LANDEN: LandKeuze[] = [
  { code: "GB", naam: "Verenigd Koninkrijk" },
  { code: "CH", naam: "Zwitserland" },
  { code: "NO", naam: "Noorwegen" },
  { code: "IS", naam: "IJsland" },
  { code: "US", naam: "Verenigde Staten" },
  { code: "CA", naam: "Canada" },
  { code: "TR", naam: "Turkije" },
  { code: "UA", naam: "Oekraïne" },
  { code: "AE", naam: "Verenigde Arabische Emiraten" },
  { code: "MA", naam: "Marokko" },
  { code: "ZZ", naam: "Ander land buiten de EU" },
];

const EU_CODES = new Set(EU_LANDEN.map((l) => l.code));
const BUITEN_CODES = new Set(BUITEN_LANDEN.map((l) => l.code));

/** Landcode netjes: hoofdletters, spaties weg. Alles wat leeg is, wordt Nederland. */
export function normaliseerLand(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "" ? "NL" : v;
}

/** Nederland, een EU-land of een land daarbuiten. Een onbekende code geeft null. */
export function landSoort(code: string | null | undefined): LandSoort | null {
  const v = normaliseerLand(code);
  if (v === "NL") return "NL";
  if (EU_CODES.has(v)) return "EU";
  if (BUITEN_CODES.has(v)) return "BUITEN";
  return null;
}

export function landNaam(code: string | null | undefined): string {
  const v = normaliseerLand(code);
  if (v === "NL") return "Nederland";
  return [...EU_LANDEN, ...BUITEN_LANDEN].find((l) => l.code === v)?.naam ?? v;
}

/** VIES schrijft Griekenland als EL; verder gelijk aan de ISO-code. */
export function viesLandCode(code: string): string {
  const v = normaliseerLand(code);
  return v === "GR" ? "EL" : v;
}

export type BuitenlandInvoer = { ok: true; soort: "EU" | "BUITEN" } | { ok: false; fout: string };

/**
 * Is de invoer voor een buitenlands bedrijf compleet? EU: een btw-nummer. Buiten de EU: een
 * registratienummer. Of het btw-nummer echt bestaat, controleert de aanroeper in VIES.
 */
export function controleerBuitenlandInvoer(input: { land: string; btwNummer: string; registratieNummer: string }): BuitenlandInvoer {
  const soort = landSoort(input.land);
  if (soort === null) return { ok: false, fout: "Kies een land uit de lijst." };
  if (soort === "NL") return { ok: false, fout: "Voor een Nederlands bedrijf vul je het KVK-nummer in." };
  if (soort === "EU") {
    if (input.btwNummer.replace(/[\s.\-]/g, "").length < 4) {
      return { ok: false, fout: "Vul het btw-nummer van je bedrijf in, met de landcode ervoor (bijvoorbeeld DE123456789)." };
    }
    return { ok: true, soort };
  }
  if (input.registratieNummer.trim().length < 3) {
    return { ok: false, fout: "Vul het registratienummer van je bedrijf in, zoals het in het handelsregister van jouw land staat." };
  }
  return { ok: true, soort };
}
