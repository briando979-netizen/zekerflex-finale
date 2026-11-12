// Vormen van het basisrekeningschema en de btw-codes (puur).

export type RekeningSoortNaam = "ACTIVA" | "PASSIVA" | "OMZET" | "KOSTEN";

export interface RekeningSjabloon {
  /** onze eigen nummering, uniek per administratie */
  nummer: string;
  naam: string;
  soort: RekeningSoortNaam;
  /** het nummer van het kopje waaronder deze rekening valt */
  ouder?: string;
  /** alleen bladen krijgen regels; kopjes niet */
  boekbaar: boolean;
  /** RGS-verwijzing: pas invullen als de accountant de code heeft bevestigd */
  rgsCode?: string;
}

export interface BtwCodeSjabloon {
  code: string;
  omschrijving: string;
  richting: "VERKOOP" | "INKOOP";
  tariefBasispunten: number;
  grondslagRubriek: string | null;
  btwRubriek: string | null;
}
