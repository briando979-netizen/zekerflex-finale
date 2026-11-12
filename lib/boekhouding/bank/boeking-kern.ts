// ---------------------------------------------------------------------------
// Bank: van een banktransactie naar een boeking (puur, zonder prisma). Bron "BANK", bronId = het id van de
// banktransactie: boek() boekt dezelfde transactie dus nooit twee keer. De omschrijving is "Banktransactie <nummer>":
// nooit een naam of IBAN (die staan alleen in BoekBankTransactie).
//   ontvangen op een factuur : bank debet, debiteuren 1200 credit (dezelfde postSleutel als de factuur)
//   betaald voor een bon      : crediteuren 2200 debet (postSleutel van de bon), bank credit
//   betaald als kosten        : kostenrekening debet, bank credit (zonder btw: de btw hoort bij de bon)
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { formatCenten } from "../bedrag";
import { postSleutelVoorBon } from "../bonnen/boeking";
import { postSleutelVoorFactuur } from "../inkomsten-kern";
import { omschrijvingVoor } from "../omschrijving";
import type { BoekInvoer, RegelInvoer } from "../types";

export type BankBoekDoel =
  | { soort: "factuur"; invoiceId: string }
  | { soort: "bon"; bonId: string }
  | { soort: "kosten"; rekeningId: string };

export interface BankBoekGegevens {
  administratieId: string;
  valuta: string;
  transactieId: string;
  boekdag: string;
  /** met teken: positief = bij, negatief = af */
  bedragCents: number;
  /** het grootboekrekening-id van de bank (BoekBankRekening.rekeningId) */
  bankRekeningId: string;
  /** het grootboekrekening-id van de tegenrekening (debiteuren, crediteuren of de kostenrekening) */
  tegenRekeningId: string;
  doel: BankBoekDoel;
  aangemaaktDoor: string;
}

/** Het nummer in de omschrijving: de laatste acht tekens van het id, in hoofdletters. */
export function banknummerVoor(transactieId: string): string {
  return transactieId.slice(-8).toUpperCase();
}

/** Controleert of het bedrag bij het doel past: ontvangen op een factuur, betaald op een bon of kosten. */
export function controleerBedragVoorDoel(bedragCents: number, doel: BankBoekDoel, openCents: number | null, valuta: string): void {
  if (doel.soort === "factuur") {
    if (bedragCents <= 0) throw AppError.validation("Een factuur koppel je aan een bijschrijving (een bedrag dat binnenkwam).");
    if (openCents !== null && bedragCents > openCents) {
      throw AppError.validation(`Het ontvangen bedrag (${formatCenten(bedragCents, valuta)}) is meer dan er op deze factuur openstaat (${formatCenten(openCents, valuta)}).`);
    }
    return;
  }
  if (bedragCents >= 0) throw AppError.validation("Een bon of kostenpost koppel je aan een afschrijving (een bedrag dat eraf ging).");
  if (doel.soort === "bon" && openCents !== null && Math.abs(bedragCents) > openCents) {
    throw AppError.validation(`Het betaalde bedrag (${formatCenten(Math.abs(bedragCents), valuta)}) is meer dan er op deze bon openstaat (${formatCenten(openCents, valuta)}).`);
  }
}

export function bouwBankBoeking(g: BankBoekGegevens): BoekInvoer {
  const bedrag = Math.abs(g.bedragCents);
  if (!Number.isSafeInteger(g.bedragCents) || bedrag === 0) throw AppError.validation("Een banktransactie met dit bedrag is niet te boeken.");
  const regels: RegelInvoer[] = [];
  if (g.doel.soort === "factuur") {
    if (g.bedragCents < 0) throw AppError.validation("Een factuur koppel je aan een bijschrijving.");
    regels.push({ rekeningId: g.bankRekeningId, debetCents: bedrag });
    regels.push({ rekeningId: g.tegenRekeningId, creditCents: bedrag, postSleutel: postSleutelVoorFactuur(g.doel.invoiceId) });
  } else {
    if (g.bedragCents > 0) throw AppError.validation("Een bon of kostenpost koppel je aan een afschrijving.");
    regels.push({
      rekeningId: g.tegenRekeningId,
      debetCents: bedrag,
      ...(g.doel.soort === "bon" ? { postSleutel: postSleutelVoorBon(g.doel.bonId) } : {}),
    });
    regels.push({ rekeningId: g.bankRekeningId, creditCents: bedrag });
  }
  return {
    administratieId: g.administratieId,
    dagboek: "BANK",
    datum: g.boekdag,
    bron: "BANK",
    bronId: g.transactieId,
    omschrijving: omschrijvingVoor("BANK", banknummerVoor(g.transactieId)),
    valuta: g.valuta,
    regels,
    aangemaaktDoor: g.aangemaaktDoor,
  };
}
