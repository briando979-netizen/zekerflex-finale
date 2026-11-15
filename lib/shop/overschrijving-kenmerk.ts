// Puur (ook voor de browser: Beheer → Webshop en de shop zelf): de kleine regels van betalen per overschrijving in de webshop.
// De rest, met het IBAN, staat in lib/shop/overschrijving.ts (server).

/** Hoe de shop nu betaald wordt: online (Stripe), per overschrijving, of (Stripe dicht en geen rekening) helemaal niet. */
export type ShopBetaalwijze = "online" | "overschrijving" | "dicht";

/** Binnen zoveel dagen overmaken; daarna mag de bestelling vervallen. */
export const SHOP_BETAALTERMIJN_DAGEN = 7;

/** Het kenmerk dat de klant in de omschrijving zet: kort genoeg om over te typen, uniek genoeg om terug te vinden. */
export function shopKenmerk(orderId: string): string {
  return `ZF-${orderId.slice(-8).toUpperCase()}`;
}

/**
 * Wacht deze bestelling op een overschrijving? Dan op betaling, zonder Stripe-sessie: de checkout zet die sessie meteen na het
 * aanmaken, en mislukt dat, dan wordt de bestelling PAYMENT_FAILED.
 */
export function wachtOpOverschrijving(o: { status: string; stripeSessionId?: string | null | undefined }): boolean {
  return o.status === "PENDING_PAYMENT" && !o.stripeSessionId;
}

/** De gegevens om over te maken, zoals de klant ze ziet (gemaakt door shopOverschrijvingVoor in lib/shop/overschrijving.ts). */
export interface ShopOverschrijving {
  naam: string;
  /** in groepen van vier, om over te typen */
  ibanLeesbaar: string;
  kenmerk: string;
  bedragCents: number;
  termijnDagen: number;
}
