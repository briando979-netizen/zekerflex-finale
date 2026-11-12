// ---------------------------------------------------------------------------
// Stripe: van een uitbetaling (payout) naar een boeking (puur, zonder prisma). Dagboek BANK, bron "BANK" met bronId
// "stripe-payout:<payout-id>": het voorvoegsel houdt het weg van de id's van banktransacties, en boek() boekt dezelfde
// payout dus nooit twee keer.
//   bank 1100 debet     = netto uitbetaald
//   betaalkosten 4200   = Stripe-kosten (debet), zonder btw: de btw-behandeling is door accountant te bevestigen
//   Stripe-saldo 1150   = credit voor het brutobedrag: de eerdere betalingen die daar stonden worden zo leeggeboekt
// Een negatieve payout (Stripe haalt geld terug van de bank) geeft de omgekeerde kanten. De omschrijving bevat alleen
// het payout-id: geen namen.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import type { BoekInvoer, RegelInvoer } from "../types";
import type { StripeUitbetaling } from "./rapport";

export const REKENING_BANK = "1100";
export const REKENING_STRIPE_SALDO = "1150";
export const REKENING_BETAALKOSTEN = "4200";

export const STRIPE_KOSTEN_REDEN = "Stripe-kosten zonder btw geboekt: de btw-behandeling is door accountant te bevestigen.";

export const bronIdVoorPayout = (payoutId: string): string => `stripe-payout:${payoutId}`;

export interface PayoutBoekContext {
  administratieId: string;
  valuta: string;
  rekeningId: (nummer: string) => string;
  aangemaaktDoor: string;
}

export function bouwPayoutBoeking(p: StripeUitbetaling, ctx: PayoutBoekContext): BoekInvoer {
  for (const c of [p.grossCents, p.feeCents, p.netCents]) {
    if (!Number.isSafeInteger(c)) throw AppError.validation("Een bedrag van de uitbetaling is geen geheel aantal centen.");
  }
  if (p.grossCents - p.feeCents !== p.netCents) throw AppError.validation("Gross min fee is niet gelijk aan net.");
  if (p.valuta !== ctx.valuta) {
    throw AppError.validation(`Deze uitbetaling is in ${p.valuta}, maar deze administratie boekt in ${ctx.valuta}. Die wordt niet geboekt.`);
  }
  const regels: RegelInvoer[] = [];
  const zet = (nummer: string, signed: number, debetBijPositief: boolean) => {
    if (signed === 0) return;
    const debet = debetBijPositief ? signed > 0 : signed < 0;
    const bedrag = Math.abs(signed);
    regels.push({ rekeningId: ctx.rekeningId(nummer), ...(debet ? { debetCents: bedrag } : { creditCents: bedrag }) });
  };
  zet(REKENING_BANK, p.netCents, true);
  zet(REKENING_BETAALKOSTEN, p.feeCents, true);
  zet(REKENING_STRIPE_SALDO, p.grossCents, false);
  if (regels.length < 2) throw AppError.validation("Een uitbetaling van nul euro is niet te boeken.");
  return {
    administratieId: ctx.administratieId,
    dagboek: "BANK",
    datum: p.boekdag,
    bron: "BANK",
    bronId: bronIdVoorPayout(p.payoutId),
    omschrijving: `Stripe-uitbetaling ${p.payoutId}`,
    valuta: p.valuta,
    regels,
    ...(p.feeCents !== 0 ? { reden: STRIPE_KOSTEN_REDEN } : {}),
    aangemaaktDoor: ctx.aangemaaktDoor,
  };
}
