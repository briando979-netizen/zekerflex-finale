import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  increments: [] as { id: string; qty: number }[],
  refunds: vi.fn(),
  coupons: vi.fn(),
  promos: vi.fn(),
  orders: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopOrder: {
      findUnique: async () => m.order,
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(m.order!, data),
      findMany: async () => m.orders,
    },
    shopProductVariant: { updateMany: async ({ where, data }: { where: { id: string }; data: { stock: { increment: number } } }) => void m.increments.push({ id: where.id, qty: data.stock.increment }) },
  },
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({ refunds: { create: m.refunds }, coupons: { create: m.coupons }, promotionCodes: { create: m.promos } }),
}));

import { createDiscountCode, ordersCsv, refundOrder } from "@/lib/shop/admin-tools";

beforeEach(() => {
  m.increments = [];
  m.refunds.mockReset().mockResolvedValue({ id: "re_1", amount: 4495 });
  m.coupons.mockReset().mockResolvedValue({ id: "co_1" });
  m.promos.mockReset().mockResolvedValue({ id: "promo_1", code: "ZOMER15" });
  m.order = { id: "o1", status: "RECEIVED", stripePaymentIntentId: "pi_1", itemsJson: [{ name: "Hesje", qty: 2, priceCents: 1500, variantId: "v1" }, { name: "Helm", qty: 1, priceCents: 1495 }] };
});

describe("webshop refunds", () => {
  it("refunds via Stripe once, cancels and books stock back", async () => {
    expect(await refundOrder("o1")).toEqual({ refundId: "re_1", amountCents: 4495 });
    expect(m.refunds).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_1" }), { idempotencyKey: "shop-refund:o1" });
    expect(m.order!.status).toBe("CANCELLED");
    expect(m.increments).toEqual([{ id: "v1", qty: 2 }]);
    await expect(refundOrder("o1")).rejects.toThrow("al geannuleerd");
  });

  it("refuses unpaid orders", async () => {
    m.order = { ...m.order!, stripePaymentIntentId: null };
    await expect(refundOrder("o1")).rejects.toThrow("niet (online) betaald");
  });
});

describe("discount codes", () => {
  it("creates a Stripe coupon + promotion code with the restrictions", async () => {
    await createDiscountCode({ code: "zomer15", percentOff: 15, maxRedemptions: 100, minimumCents: 2500, firstTimeOnly: true });
    expect(m.coupons).toHaveBeenCalledWith(expect.objectContaining({ percent_off: 15, duration: "once" }));
    expect(m.promos).toHaveBeenCalledWith(expect.objectContaining({ code: "ZOMER15", max_redemptions: 100, restrictions: { minimum_amount: 2500, minimum_amount_currency: "eur", first_time_transaction: true } }));
  });

  it("validates the input", async () => {
    await expect(createDiscountCode({ code: "x", percentOff: 10 })).rejects.toThrow("3–30");
    await expect(createDiscountCode({ code: "DUBBEL", percentOff: 10, amountOffCents: 500 })).rejects.toThrow("óf een percentage");
  });
});

describe("orders CSV", () => {
  it("exports one line per order in Dutch Excel format", async () => {
    m.orders = [{ id: "o1", createdAt: new Date("2026-10-01T10:00:00Z"), status: "SHIPPED", firstName: "An", lastName: "Jansen", email: "an@x.nl", address: "Dorpsstraat 1", postalCode: "1234 AB", city: "Utrecht", itemsJson: [{ name: "Hesje", qty: 2, size: "L" }], subtotalCents: 3000, shippingCents: 495, totalCents: 3495, carrier: "postnl", trackingNumber: "3S123" }];
    const out = await ordersCsv(new Date("2026-10-01"), new Date("2026-11-01"));
    expect(out).toContain("o1;2026-10-01 10:00;SHIPPED;An Jansen;an@x.nl");
    expect(out).toContain("2x Hesje L;30,00;4,95;34,95;postnl;3S123");
  });
});
