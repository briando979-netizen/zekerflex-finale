// ---------------------------------------------------------------------------
// Bank (fase 2): gedeelde vormen van een ingelezen bankafschrift (puur, zonder prisma).
// AVG: een afschrift bevat persoonsgegevens (naam en IBAN van tegenpartijen). Ze horen bij de administratie van het
// platform en vallen onder de bewaarplicht van 7 jaar; ze staan ALLEEN in BoekBankTransactie en het bestand op het
// opslagvolume, nooit in BoekBoeking/BoekRegel, het logboek of het auditspoor.
// ---------------------------------------------------------------------------

/** Hoeveel een afschriftbestand hooguit mag zijn en hoeveel transacties erin mogen staan. */
export const BANK_MAX_BYTES = 5 * 1024 * 1024;
export const BANK_MAX_TRANSACTIES = 20_000;

export type BankFormaatNaam = "CAMT053" | "CSV";

/** Eén transactie zoals het afschrift hem geeft. Bedrag met teken: positief = bij, negatief = af. */
export interface BankRegel {
  /** boekdatum als Amsterdamse dagsleutel, "2026-04-10" */
  boekdag: string;
  valutadag: string | null;
  bedragCents: number;
  valuta: string;
  tegenIban: string | null;
  tegenNaam: string | null;
  omschrijving: string | null;
  endToEndId: string | null;
  /** de eigen referentie van de bank, als het bestand er een heeft (bepaalt de unieke sleutel) */
  bankReferentie: string | null;
}

/** Wat het koppelen van nieuwe transacties opleverde (aantallen). */
export interface VerwerkUitkomst {
  bekeken: number;
  geboekt: number;
  gekoppeld: number;
  evenKijken: number;
  /** transacties waarbij vanzelf boeken niet lukte (bv. periode vergrendeld); ze staan bij "even kijken" */
  mislukt: number;
}

/** Wat het inlezen van een bestand opleverde (voor het scherm). */
export interface ImportUitkomst {
  afschriftId: string;
  /** true = dit bestand was al eerder ingelezen: er is niets nieuws gedaan */
  alIngelezen: boolean;
  herkend: string;
  formaat: BankFormaatNaam;
  /** transacties in het bestand */
  totaal: number;
  nieuw: number;
  alBekend: number;
  waarschuwingen: string[];
  verwerkt: VerwerkUitkomst | null;
}

/** Een ingelezen afschrift (één rekening). */
export interface BankAfschriftData {
  formaat: BankFormaatNaam;
  /** leesbare naam van wat is herkend, bv. "ING (csv)" */
  herkend: string;
  /** het IBAN van de eigen rekening volgens het bestand; null als het bestand er geen heeft */
  rekeningIban: string | null;
  afschriftNummer: string | null;
  vanaf: string | null;
  totEnMet: string | null;
  beginSaldoCents: number | null;
  eindSaldoCents: number | null;
  valuta: string;
  transacties: BankRegel[];
  /** dingen die opvielen maar het inlezen niet blokkeren (bv. een saldoverschil) */
  waarschuwingen: string[];
}
