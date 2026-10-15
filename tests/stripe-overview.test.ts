import { afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const client = {
  balance: { retrieve: vi.fn() },
  charges: { list: vi.fn() },
  payouts: { list: vi.fn() },
  disputes: { list: vi.fn() },
  balanceTransactions: { list: vi.fn() },
};
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: () => client }));

import { describeMethod, getStripeOverview, linkFor, summarizeLast30 } from "@/lib/billing/stripe-overview";

const details = (d: Record<string, unknown>) => d as unknown as Stripe.Charge.PaymentMethodDetails;
const txn = (type: string, amount: number, fee = 0, currency = "eur") =>
  ({ type, amount, fee, net: amount - fee, currency }) as unknown as Stripe.BalanceTransaction;

afterEach(() => vi.clearAllMocks());

describe("describeMethod", () => {
  it("names wallets, iDEAL banks, card-present and Link the way people know them", () => {
    expect(describeMethod(details({ type: "card", card: { brand: "visa", last4: "4242", wallet: { type: "apple_pay" } } }))).toBe(
      "Apple Pay · Visa •••• 4242",
    );
    expect(describeMethod(details({ type: "card", card: { brand: "mastercard", last4: "1111", wallet: null } }))).toBe(
      "Mastercard •••• 1111",
    );
    expect(describeMethod(details({ type: "ideal", ideal: { bank: "ing" } }))).toBe("iDEAL · ING");
    expect(describeMethod(details({ type: "card_present", card_present: { brand: "visa", last4: "0005" } }))).toBe(
      "Visa •••• 0005 · aan de kassa",
    );
    expect(describeMethod(details({ type: "link" }))).toBe("Stripe Link");
    expect(describeMethod(null)).toBe("—");
  });
});

describe("linkFor", () => {
  it("points a payment at the ZekerFlex record it settled", () => {
    expect(linkFor({ invoiceId: "inv_1" })).toEqual({ href: "/api/invoices/inv_1/pdf", label: "Factuur" });
    expect(linkFor({ invoiceIds: JSON.stringify(["a", "b"]) })).toEqual({ href: "/admin/facturen?status=PAID", label: "2 facturen" });
    expect(linkFor({ shopOrderId: "ord_1" })).toEqual({ href: "/admin/shop", label: "Shopbestelling" });
    expect(linkFor({})).toBeNull();
  });
});

describe("summarizeLast30", () => {
  it("adds up gross, refunds and fees — including Stripe's own fee transactions — in euros only", () => {
    const s = summarizeLast30([
      txn("charge", 10_000, 175),
      txn("payment", 5_000, 29),
      txn("refund", -2_000),
      txn("stripe_fee", -150),
      txn("payout", -8_000),
      txn("charge", 99_999, 0, "usd"),
    ]);
    expect(s).toEqual({
      grossCents: 15_000,
      refundedCents: 2_000,
      feeCents: 175 + 29 + 150,
      netCents: 10_000 - 175 + (5_000 - 29) - 2_000 - 150,
      payments: 2,
    });
  });
});

describe("getStripeOverview", () => {
  it("keeps the other sections when one is not readable with the key", async () => {
    client.balance.retrieve.mockResolvedValue({
      livemode: false,
      available: [{ amount: 4_800, currency: "eur" }],
      pending: [{ amount: 1_200, currency: "eur" }],
    });
    client.charges.list.mockResolvedValue({
      data: [
        {
          id: "ch_1",
          created: 1_760_000_000,
          amount: 12_345,
          amount_refunded: 0,
          currency: "eur",
          status: "succeeded",
          payment_method_details: { type: "ideal", ideal: { bank: "rabobank" } },
          billing_details: { email: "boekhouding@bakkerijbol.nl", name: null },
          receipt_email: null,
          description: null,
          metadata: {},
          payment_intent: { id: "pi_1", metadata: { invoiceId: "inv_9" } },
        },
      ],
    });
    client.payouts.list.mockRejectedValue(new Error("The provided key does not have the required permissions"));
    client.disputes.list.mockResolvedValue({
      data: [{ id: "dp_1", amount: 5_000, currency: "eur", reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1_760_500_000 } }],
    });
    client.balanceTransactions.list.mockReturnValue({ autoPagingToArray: async () => [txn("charge", 12_345, 30)] });

    const o = await getStripeOverview();

    expect(o.livemode).toBe(false);
    expect(o.balance).toEqual({ available: [{ amountCents: 4_800, currency: "eur" }], pending: [{ amountCents: 1_200, currency: "eur" }] });
    expect(o.payments[0]).toMatchObject({
      method: "iDEAL · Rabobank",
      payer: "boekhouding@bakkerijbol.nl",
      link: { href: "/api/invoices/inv_9/pdf", label: "Factuur" },
      dashboardUrl: "https://dashboard.stripe.com/test/payments/pi_1",
    });
    expect(o.payouts).toEqual([]);
    expect(o.errors).toEqual(["Uitbetalingen: de Stripe-sleutel heeft hier geen leesrechten voor."]);
    expect(o.disputes[0]).toMatchObject({ open: true, dashboardUrl: "https://dashboard.stripe.com/test/disputes/dp_1" });
    expect(o.last30).toMatchObject({ grossCents: 12_345, feeCents: 30, payments: 1 });
  });
});
