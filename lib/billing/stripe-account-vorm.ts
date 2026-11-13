// ---------------------------------------------------------------------------
// Het Stripe-account van het platform wisselen (13 nov 2026, eigenaar: "Je moet zekerflex even vergeten. Bij
// Stripe. En dan moet je bij Stripe mijn nieuwe account dan zekerflex INC zien."). Puur: de regels voor de sleutel,
// de gebeurtenissen van de webhook en wat het beheer laat zien. De opslag en de aanroepen naar Stripe staan in
// lib/billing/stripe-account.ts.
// ---------------------------------------------------------------------------

/** De gebeurtenissen die app/api/webhooks/stripe/route.ts verwerkt; de webhook op het nieuwe account krijgt precies deze. */
export const STRIPE_WEBHOOK_EVENTS = [
  "account.updated",
  "charge.dispute.closed",
  "charge.dispute.created",
  "charge.refunded",
  "checkout.session.async_payment_succeeded",
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.paid",
  "invoice.payment_failed",
  "issuing_authorization.request",
  "issuing_authorization.updated",
  "issuing_card.updated",
  "issuing_transaction.created",
  // de ID-controle via Stripe Identity (lib/kyc/stripe-identity.ts, alles met identity.verification_session.)
  "identity.verification_session.canceled",
  "identity.verification_session.created",
  "identity.verification_session.processing",
  "identity.verification_session.redacted",
  "identity.verification_session.requires_input",
  "identity.verification_session.verified",
] as const;

/** De foutmelding bij een sleutel die niet kan, of null als de vorm klopt (de controle bij Stripe volgt daarna). */
export function stripeAccountSleutelFout(s: string): string | null {
  const t = s.trim();
  if (/^pk_/.test(t)) return "Dat is de publieke sleutel (pk_…). Plak de geheime sleutel (sk_live_… of een beperkte rk_live_…).";
  if (/^whsec_/.test(t)) return "Dat is het webhook-geheim. Plak de geheime sleutel (sk_live_… of rk_live_…); de webhook maakt de server zelf aan.";
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/.test(t)) return "Plak de geheime sleutel uit Stripe (Ontwikkelaars → API-sleutels): die begint met sk_live_ of rk_live_.";
  return null;
}

export const isLiveSleutel = (s: string): boolean => /^(sk|rk)_live_/.test(s.trim());

/** Alleen de laatste 4 tekens, voor het beheer en de audit. */
export const sleutelEindVan = (s: string): string => s.trim().slice(-4);

export interface StripeAccountCheck {
  accountId: string;
  /** de weergavenaam (business_profile of dashboard) */
  naam: string | null;
  /** de juridische naam van het bedrijf, als Stripe die geeft */
  juridischeNaam: string | null;
  land: string | null;
  betalen: boolean;
  uitbetalen: boolean;
  identity: "werkt" | "niet toegestaan" | "onbekend";
  live: boolean;
  eind: string;
}

/** Wat Beheer laat zien over het account dat nu actief is; nooit de sleutel of het webhook-geheim zelf. */
export interface StripeAccountInfo {
  accountId: string;
  naam: string | null;
  land: string | null;
  eind: string;
  ingesteldOp: string;
  door: string;
  webhook: boolean;
  heeftVorige: boolean;
}

/** Mag dit account het platform worden? Alleen live, en alleen als het betalingen kan ontvangen. */
export function waaromNietGebruiken(c: StripeAccountCheck): string | null {
  if (!c.live) return "Dit is een testsleutel. Gebruik de live sleutel (sk_live_ of rk_live_).";
  if (!c.betalen) return "Dit Stripe-account kan nog geen betalingen ontvangen. Rond eerst de activatie af in het Stripe-dashboard (paspoort, bank, bedrijfsgegevens).";
  return null;
}
