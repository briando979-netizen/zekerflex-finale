// Pure hulpjes voor de Stripe-schermen in admin (klantpagina en werkbank): gewone Nederlandse
// tekst bij een Stripe-gebeurtenis, een telling per dag en de vraag "hoort dit event bij deze klant".
// Geen Stripe-client en geen prisma, dus ook bruikbaar in tests.

export interface EventKern {
  id: string;
  type: string;
  /** Unix-seconden. */
  created: number;
  objectId: string | null;
  objectType: string | null;
  /** Klant waar het object bij hoort, als het object die kent. */
  customerId: string | null;
  requestId: string | null;
  idempotencyKey: string | null;
  apiVersion: string | null;
  pendingWebhooks: number;
}

const TEKSTEN: Record<string, string> = {
  "customer.created": "Er is een klant aangemaakt",
  "customer.updated": "De klant is bijgewerkt",
  "customer.deleted": "De klant is verwijderd",
  "payment_method.attached": "Een betaalmethode is gekoppeld aan de klant",
  "payment_method.detached": "Een betaalmethode is losgekoppeld van de klant",
  "payment_method.updated": "Een betaalmethode is bijgewerkt",
  "setup_intent.created": "Er is een nieuwe instelling voor een betaalmethode gestart",
  "setup_intent.succeeded": "De instelling van een betaalmethode is gelukt",
  "setup_intent.requires_action": "De instelling van een betaalmethode vraagt nog een actie van de klant",
  "setup_intent.setup_failed": "De instelling van een betaalmethode is mislukt",
  "setup_intent.canceled": "De instelling van een betaalmethode is geannuleerd",
  "mandate.updated": "Een machtiging is bijgewerkt",
  "checkout.session.completed": "Een afrekensessie is afgerond",
  "checkout.session.expired": "Een afrekensessie is verlopen",
  "checkout.session.async_payment_succeeded": "Een betaling uit een afrekensessie is binnengekomen",
  "checkout.session.async_payment_failed": "Een betaling uit een afrekensessie is mislukt",
  "payment_intent.created": "Er is een betaling gestart",
  "payment_intent.succeeded": "Een betaling is geslaagd",
  "payment_intent.payment_failed": "Een betaling is mislukt",
  "payment_intent.processing": "Een betaling wordt verwerkt",
  "payment_intent.canceled": "Een betaling is geannuleerd",
  "payment_intent.requires_action": "Een betaling vraagt nog een actie van de klant",
  "charge.succeeded": "Een afschrijving is geslaagd",
  "charge.failed": "Een afschrijving is mislukt",
  "charge.refunded": "Een afschrijving is terugbetaald",
  "charge.updated": "Een afschrijving is bijgewerkt",
  "charge.pending": "Een afschrijving is in behandeling",
  "charge.dispute.created": "Een klant heeft een betaling betwist",
  "charge.dispute.closed": "Een geschil is afgesloten",
  "charge.dispute.updated": "Een geschil is bijgewerkt",
  "invoice.created": "Er is een factuur aangemaakt",
  "invoice.finalized": "Een factuur is definitief gemaakt",
  "invoice.paid": "Een factuur is betaald",
  "invoice.payment_succeeded": "De betaling van een factuur is geslaagd",
  "invoice.payment_failed": "De betaling van een factuur is mislukt",
  "invoice.voided": "Een factuur is ongeldig gemaakt",
  "customer.subscription.created": "Er is een abonnement gestart",
  "customer.subscription.updated": "Een abonnement is gewijzigd",
  "customer.subscription.deleted": "Een abonnement is beëindigd",
  "payout.created": "Er is een uitbetaling aangemaakt",
  "payout.paid": "Een uitbetaling staat op de bankrekening",
  "payout.failed": "Een uitbetaling is mislukt",
  "balance.available": "Er is saldo vrijgegeven",
  "identity.verification_session.created": "Er is een identiteitscontrole gestart",
  "identity.verification_session.processing": "Een identiteitscontrole wordt verwerkt",
  "identity.verification_session.verified": "Een identiteitscontrole is gelukt",
  "identity.verification_session.requires_input": "Een identiteitscontrole vraagt nieuwe invoer",
  "identity.verification_session.canceled": "Een identiteitscontrole is geannuleerd",
};

/** Gewone tekst bij een eventtype; onbekende typen blijven de Stripe-naam houden. */
export function eventTekst(type: string): string {
  return TEKSTEN[type] ?? type;
}

/** Events die op een mislukking of een probleem wijzen: voeden het tabblad Gezondheid. */
export const PROBLEEM_TYPEN = new Set([
  "payment_intent.payment_failed",
  "charge.failed",
  "invoice.payment_failed",
  "payout.failed",
  "setup_intent.setup_failed",
  "checkout.session.async_payment_failed",
  "charge.dispute.created",
]);

export function isProbleem(type: string): boolean {
  return PROBLEEM_TYPEN.has(type);
}

/** Hoort dit event bij deze klant: het object is de klant zelf, of verwijst naar de klant. */
export function hoortBijKlant(e: EventKern, klantId: string): boolean {
  return e.customerId === klantId || (e.objectType === "customer" && e.objectId === klantId);
}

function dagSleutel(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(unixSeconds * 1000);
}

/** Aantal events per Amsterdamse dag over de laatste `dagen` dagen, oudste eerst, ook lege dagen. */
export function perDag(events: EventKern[], dagen: number, nu = Date.now(), filter?: (e: EventKern) => boolean): { labels: string[]; waarden: number[] } {
  const labels: string[] = [];
  for (let i = dagen - 1; i >= 0; i--) labels.push(dagSleutel(Math.floor((nu - i * 86_400_000) / 1000)));
  const telling = new Map(labels.map((l) => [l, 0]));
  for (const e of events) {
    if (filter && !filter(e)) continue;
    const k = dagSleutel(e.created);
    if (telling.has(k)) telling.set(k, (telling.get(k) ?? 0) + 1);
  }
  return { labels, waarden: labels.map((l) => telling.get(l) ?? 0) };
}

/** Telling per eventtype, grootste eerst. */
export function perType(events: EventKern[]): { type: string; aantal: number }[] {
  const m = new Map<string, number>();
  for (const e of events) m.set(e.type, (m.get(e.type) ?? 0) + 1);
  return [...m.entries()].map(([type, aantal]) => ({ type, aantal })).sort((a, b) => b.aantal - a.aantal || a.type.localeCompare(b.type));
}

/** Telling per API-versie van de events, nieuwste naam eerst. */
export function perVersie(events: EventKern[]): { versie: string; aantal: number }[] {
  const m = new Map<string, number>();
  for (const e of events) {
    const v = e.apiVersion ?? "onbekend";
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].map(([versie, aantal]) => ({ versie, aantal })).sort((a, b) => b.versie.localeCompare(a.versie));
}

/** Een event dat na een uur nog op een webhook wacht, is vermoedelijk niet afgeleverd. */
export function nietAfgeleverd(e: EventKern, nu = Date.now()): boolean {
  return e.pendingWebhooks > 0 && nu - e.created * 1000 > 3_600_000;
}

/** Alleen een id die op een Stripe-id lijkt, zodat een adres of zoekterm er nooit een vreemde waarde door krijgt. */
export function isStripeId(waarde: string, voorvoegsel: string): boolean {
  return new RegExp(`^${voorvoegsel}_[A-Za-z0-9]{6,80}$`).test(waarde);
}

/** "9 nov 2026, 15:42:16" in Amsterdamse tijd, met seconden: Stripe-events volgen elkaar snel op. */
export function momentNl(waarde: number | string): string {
  const ms = typeof waarde === "number" ? waarde * 1000 : new Date(waarde).getTime();
  return new Date(ms).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
