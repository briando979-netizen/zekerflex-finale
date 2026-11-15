import { ibanLeesbaar } from "@/lib/billing/overschrijving";
import { isValidIban } from "@/lib/billing/sepa";
import { SHOP_BETAALTERMIJN_DAGEN, shopKenmerk, wachtOpOverschrijving, type ShopBetaalwijze, type ShopOverschrijving } from "@/lib/shop/overschrijving-kenmerk";

// ---------------------------------------------------------------------------
// Webshop: betalen per bankoverschrijving (15 nov 2026). Stripe ontvangt sinds 11 nov geen betalingen; daardoor kon niemand iets
// bestellen (POST /api/shop/orders gaf meteen "betalen staat uit"). Is de rekening van ZekerFlex ingevuld (SEPA_CREDITOR_IBAN en
// SEPA_CREDITOR_NAME, eigenaar-taak "sepa"), dan gaat de bestelling door en maakt de klant zelf over, met een kort kenmerk in de
// omschrijving. Iemand ziet de betaling op de rekening en zet de bestelling in Beheer → Webshop op betaald; pas dan gaat de voorraad
// eraf en komen de bevestigingsmails (lib/shop/bestelling-betaald.ts), net als na een betaling via Stripe.
// Server: het IBAN-controlecijfer zit in lib/billing/sepa.ts. De kleine regels voor de browser staan in overschrijving-kenmerk.ts.
// Geen IBAN in een log.
// ---------------------------------------------------------------------------

/** Is de rekening van ZekerFlex bruikbaar om op over te maken? Nooit verzonnen: geen of een ongeldig IBAN is nee. */
export function rekeningBruikbaar(bank: { iban: string | null | undefined; naam: string | null | undefined }): boolean {
  const iban = (bank.iban ?? "").replace(/\s+/g, "").toUpperCase();
  return Boolean(iban && (bank.naam ?? "").trim() && isValidIban(iban));
}

export function shopBetaalwijze(stripeDicht: boolean, rekening: boolean): ShopBetaalwijze {
  if (!stripeDicht) return "online";
  return rekening ? "overschrijving" : "dicht";
}

/** De gegevens om over te maken, of null: alleen een bestelling die op een overschrijving wacht, met een bruikbare rekening. */
export function shopOverschrijvingVoor(i: {
  iban: string | null | undefined;
  naam: string | null | undefined;
  orderId: string;
  totaalCents: number;
  status: string;
  stripeSessionId: string | null | undefined;
}): ShopOverschrijving | null {
  if (!wachtOpOverschrijving(i)) return null;
  if (!rekeningBruikbaar(i) || !Number.isFinite(i.totaalCents) || i.totaalCents <= 0) return null;
  return {
    naam: (i.naam ?? "").trim(),
    ibanLeesbaar: ibanLeesbaar(i.iban ?? ""),
    kenmerk: shopKenmerk(i.orderId),
    bedragCents: i.totaalCents,
    termijnDagen: SHOP_BETAALTERMIJN_DAGEN,
  };
}
