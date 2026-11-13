// ---------------------------------------------------------------------------
// Eigenaar-taken rond Stripe na de wissel naar Zekerflex, Inc. (14 nov 2026). Er staan drie taken die in de kern hetzelfde
// zeggen ("er komt geen geld binnen"): kies het nieuwe account (stripe-account-inc), de webhook-handtekening klopt niet
// (stripe-webhook-handtekening) en Stripe ontvangt geen betalingen (stripe-betalen-uit). De eerste is de ene echte
// geld-binnen-taak. De andere twee volgen de stand uit Beheer -> Stripe-account (stripeAccountInfo):
//  - actief account met een eigen webhook: het oude .env-geheim doet er niet meer toe, de handtekening-taak is achterhaald;
//  - geen actief account: de taken blijven, maar de handtekening-taak en "betalen uit" tellen niet apart als eerst;
//  - een leesfout (undefined): niets veranderen, om niets vals te tonen.
// Puur: alleen de stand, nooit een sleutel of een geheim.
// ---------------------------------------------------------------------------

import type { StripeAccountInfo } from "@/lib/billing/stripe-account-vorm";
import type { Eerst } from "@/lib/admin/te-doen-eerst";

/** `undefined` = niet kunnen lezen, `null` = geen actief account uit Beheer. */
export type StripeStand = StripeAccountInfo | null | undefined;

export const WISSEL_VERWIJZING =
  "Let op: kies je het Stripe-account van Zekerflex, Inc. (zie de taak over betalen via Zekerflex, Inc.), dan maakt ZekerFlex zelf een nieuwe webhook en is dit niet meer nodig. ";

export const BETALEN_UIT_VERWIJZING = "Zolang het nieuwe account nog niet is gekozen, is dit dezelfde zaak als de taak over betalen via Zekerflex, Inc.: kies daar eerst het nieuwe account. ";

/** De taak over de webhook-handtekening: achterhaald zodra het actieve account een eigen webhook heeft. */
export function webhookHandtekeningStand(stand: StripeStand): { achterhaald: boolean; doneNote?: string } {
  if (stand && stand.webhook) {
    return { achterhaald: true, doneNote: "niet meer nodig: het actieve Stripe-account heeft een eigen webhook met een eigen geheim" };
  }
  return { achterhaald: false };
}

/**
 * Telt "Stripe ontvangt geen betalingen" apart mee in het blok Begin hier? Alleen als er een actief account is (dan is het
 * een echt probleem met dat account) of als de stand niet te lezen is (dan blijft het zoals het was). Is er bekend geen
 * actief account (null), dan is stripe-account-inc de ene geld-binnen-taak.
 */
export function betalenUitEerst(stand: StripeStand): Eerst | undefined {
  return stand === null ? undefined : { reden: "geld binnen" };
}

/** De korte uitleg voor het begin van de tekst bij "betalen uit": alleen als er bekend geen actief account is. */
export function betalenUitVoorzin(stand: StripeStand): string {
  return stand === null ? BETALEN_UIT_VERWIJZING : "";
}
