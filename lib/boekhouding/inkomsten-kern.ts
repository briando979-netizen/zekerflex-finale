// ---------------------------------------------------------------------------
// Boekhouding: van een platformfactuur naar een boeking (puur, zonder prisma). De factuur is het wettelijke stuk: we
// nemen zijn bedragen over (niet opnieuw uitrekenen) en controleren alleen of ze kloppen. Alles in gehele centen.
// De omschrijving is altijd "Factuur <nummer>": nooit een klantnaam.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { isGeheleCenten } from "./bedrag";
import { omschrijvingVoor } from "./omschrijving";
import type { BoekInvoer, RegelInvoer } from "./types";

/**
 * Welke factuursoorten als omzet worden geboekt, en op welke omzetrekening (nummer uit het basisschema).
 * Bewust ALLEEN de platformfee: SELF_BILL_FREELANCER (dienst van de werker, geen omzet van het platform),
 * CANCELLATION_PENALTY, UITZEND_FEE en DOMEIN worden voorlopig NIET geboekt. De eigenaar en de accountant beslissen
 * of en hoe; breid deze lijst dan uit (en de test erbij).
 */
export const OMZET_REKENING_PER_FACTUURSOORT: Readonly<Record<string, string>> = {
  PLATFORM_FEE: "8000",
};

export const FACTUURSOORTEN_VOOR_OMZET: readonly string[] = Object.keys(OMZET_REKENING_PER_FACTUURSOORT);

export const REKENING_DEBITEUREN = "1200";
export const REKENING_TE_BETALEN_BTW = "2300";
/** Betaalde facturen komen binnen via Stripe Checkout: eerst op het Stripe-saldo, later gekoppeld aan de bank. */
export const REKENING_STRIPE_SALDO = "1150";

export const BTW_CODE_21 = "NL21-V";
export const BTW_CODE_9 = "NL09-V";
export const BTW_CODE_0 = "NL00-V";

/** De velden van een Invoice die de boeking nodig heeft. */
export interface FactuurGegevens {
  id: string;
  number: string;
  type: string;
  status: string;
  currency: string;
  vatTreatment: string;
  vatRate: number;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  issuedAt: Date | null;
  createdAt: Date;
  paidAt: Date | null;
  stripePaymentIntentId: string | null;
}

/** Rekening- en btw-code-id's van de administratie, op nummer respectievelijk code. */
export interface BoekContext {
  administratieId: string;
  valuta: string;
  rekeningId: (nummer: string) => string;
  btwCodeId: (code: string) => string;
}

export function postSleutelVoorFactuur(invoiceId: string): string {
  return `factuur:${invoiceId}`;
}

/** Alleen soorten uit OMZET_REKENING_PER_FACTUURSOORT en geen concept of geannuleerde factuur worden geboekt. */
export function isBoekbaarAlsOmzet(f: Pick<FactuurGegevens, "type" | "status">): boolean {
  return Object.hasOwn(OMZET_REKENING_PER_FACTUURSOORT, f.type) && (f.status === "ISSUED" || f.status === "PAID");
}

/** De btw-code bij het tarief van de factuur; verlegd, buiten de btw of 0% geeft de 0%-code zonder btw-regel. */
export function btwCodeVoorFactuur(f: Pick<FactuurGegevens, "vatTreatment" | "vatRate" | "vatCents" | "number">): string {
  if (f.vatTreatment !== "STANDARD_RATE") {
    if (f.vatCents !== 0) {
      throw AppError.validation(`Factuur ${f.number}: btw-bedrag bij verlegde of niet-btw-plichtige verkoop hoort 0 te zijn.`);
    }
    return BTW_CODE_0;
  }
  const basispunten = Math.round(f.vatRate * 10000);
  if (basispunten === 2100) return BTW_CODE_21;
  if (basispunten === 900) return BTW_CODE_9;
  if (basispunten === 0) return BTW_CODE_0;
  throw AppError.validation(`Factuur ${f.number}: het btw-tarief (${f.vatRate}) is geen 21%, 9% of 0%. Een accountant bepaalt hoe dit geboekt wordt.`);
}

function controleerBedragen(f: FactuurGegevens): void {
  for (const n of [f.subtotalCents, f.vatCents, f.totalCents]) {
    if (!isGeheleCenten(n)) throw AppError.validation(`Factuur ${f.number}: een bedrag is geen geheel aantal centen.`);
  }
  if (f.subtotalCents < 0 || f.vatCents < 0 || f.totalCents < 0) {
    throw AppError.validation(`Factuur ${f.number}: een negatief bedrag (creditnota) wordt nog niet geboekt; een accountant bepaalt dat.`);
  }
  if (f.subtotalCents + f.vatCents !== f.totalCents) {
    throw AppError.validation(`Factuur ${f.number}: grondslag plus btw is niet gelijk aan het totaal.`);
  }
}

/**
 * De verkoopboeking van een factuur: debiteuren debet (totaal), omzet credit (excl. btw), btw te betalen credit.
 * Geeft null als er niets te boeken valt (totaal 0).
 */
export function bouwFactuurBoeking(f: FactuurGegevens, ctx: BoekContext, boekdag: string): BoekInvoer | null {
  if (!isBoekbaarAlsOmzet(f)) {
    throw AppError.validation(`Factuur ${f.number} (${f.type}, ${f.status}) wordt niet als omzet geboekt.`);
  }
  controleerBedragen(f);
  if (f.totalCents === 0) return null;
  const omzetRekening = OMZET_REKENING_PER_FACTUURSOORT[f.type];
  if (omzetRekening === undefined) throw AppError.validation(`Factuur ${f.number}: geen omzetrekening voor dit soort.`);
  const btwCode = btwCodeVoorFactuur(f);
  const sleutel = postSleutelVoorFactuur(f.id);

  const regels: RegelInvoer[] = [
    { rekeningId: ctx.rekeningId(REKENING_DEBITEUREN), debetCents: f.totalCents, postSleutel: sleutel },
  ];
  if (f.subtotalCents > 0) {
    regels.push({
      rekeningId: ctx.rekeningId(omzetRekening),
      creditCents: f.subtotalCents,
      btwCodeId: ctx.btwCodeId(btwCode),
      btwBasisCents: f.subtotalCents,
    });
  }
  if (f.vatCents > 0) {
    regels.push({
      rekeningId: ctx.rekeningId(REKENING_TE_BETALEN_BTW),
      creditCents: f.vatCents,
      btwCodeId: ctx.btwCodeId(btwCode),
      isBtwRegel: true,
    });
  }
  return {
    administratieId: ctx.administratieId,
    dagboek: "VERKOOP",
    datum: boekdag,
    bron: "FACTUUR",
    bronId: f.id,
    omschrijving: omschrijvingVoor("FACTUUR", f.number),
    valuta: f.currency,
    regels,
  };
}

/**
 * De betaling van een factuur: Stripe-saldo debet, debiteuren credit (zelfde postSleutel, zodat de open post sluit).
 * Een betaling zonder Stripe-betaalgegevens boeken we niet: de betaalweg (bank, contant) is dan niet bekend.
 */
export function bouwBetalingBoeking(f: FactuurGegevens, ctx: BoekContext, boekdag: string): BoekInvoer | null {
  if (f.status !== "PAID" || f.paidAt === null) {
    throw AppError.validation(`Factuur ${f.number} is niet betaald.`);
  }
  if (f.stripePaymentIntentId === null) {
    throw AppError.validation(`Factuur ${f.number}: de betaalweg is niet bekend (geen Stripe-betaling); die betaling boek je met de bank mee.`);
  }
  controleerBedragen(f);
  if (f.totalCents === 0) return null;
  return {
    administratieId: ctx.administratieId,
    dagboek: "BANK",
    datum: boekdag,
    bron: "FACTUUR_BETALING",
    bronId: f.id,
    omschrijving: omschrijvingVoor("FACTUUR_BETALING", f.number),
    valuta: f.currency,
    regels: [
      { rekeningId: ctx.rekeningId(REKENING_STRIPE_SALDO), debetCents: f.totalCents },
      { rekeningId: ctx.rekeningId(REKENING_DEBITEUREN), creditCents: f.totalCents, postSleutel: postSleutelVoorFactuur(f.id) },
    ],
  };
}
