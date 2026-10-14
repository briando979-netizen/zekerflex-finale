import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_test_123" } }));

const sessionsCreate = vi.fn().mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/cs_test_1" });
vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: { create: (...a: unknown[]) => sessionsCreate(...a) } };
  },
}));

import { createShopOrderCheckoutSession } from "@/lib/billing/stripe";

// De shop belooft op meerdere plekken (storefront-nieuwsbriefblok) een
// "WELKOM10"-kortingscode bij inschrijving — zonder allow_promotion_codes
// heeft Stripe Checkout geen veld om die code in te vullen, dus de belofte
// zou voor niemand inlosbaar zijn. Dit bewaakt dat de vlag altijd meegaat.
describe("createShopOrderCheckoutSession", () => {
  it("enables promotion codes so the advertised WELKOM10 discount is actually redeemable", async () => {
    await createShopOrderCheckoutSession({
      orderId: "order_1",
      email: "jan@example.nl",
      lines: [{ name: "Werkschoenen S3", priceCents: 1999, qty: 1 }],
      shippingCents: 0,
      successUrl: "https://zekerflex.com/shop/bestelling/order_1?paid=1",
      cancelUrl: "https://zekerflex.com/shop/bestelling/order_1?cancelled=1",
    });

    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ allow_promotion_codes: true }));
  });
});
