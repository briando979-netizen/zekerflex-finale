import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const constructWebhookEvent = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({ constructWebhookEvent: (...a: unknown[]) => constructWebhookEvent(...a) }));

const claimIdempotency = vi.fn().mockResolvedValue(true);
const releaseIdempotency = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/redis", () => ({
  claimIdempotency: (...a: unknown[]) => claimIdempotency(...a),
  releaseIdempotency: (...a: unknown[]) => releaseIdempotency(...a),
}));

const recordAudit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

const fulfillPaidClaim = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/claims/fulfillment", () => ({ fulfillPaidClaim: (...a: unknown[]) => fulfillPaidClaim(...a) }));
vi.mock("@/lib/billing/api-subscription-sync", () => ({
  activateApiSubscription: vi.fn().mockResolvedValue(undefined),
  syncApiSubscription: vi.fn().mockResolvedValue(undefined),
}));

const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailShell: (title: string, body: string) => `<html>${title}${body}</html>`,
}));

const invoiceFindUnique = vi.fn();
const invoiceUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopOrder: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    shopProductVariant: { updateMany: vi.fn() },
    invoice: {
      findUnique: (...a: unknown[]) => invoiceFindUnique(...a),
      update: (...a: unknown[]) => invoiceUpdate(...a),
    },
    freelancerProfile: { updateMany: vi.fn() },
  },
}));

const recordChargeRefund = vi.fn().mockResolvedValue(undefined);
const recordDisputeOpened = vi.fn().mockResolvedValue(undefined);
const recordDisputeClosed = vi.fn().mockResolvedValue(undefined);
const settleClawbacks = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/billing/clawback", () => ({
  recordChargeRefund: (...a: unknown[]) => recordChargeRefund(...a),
  recordDisputeOpened: (...a: unknown[]) => recordDisputeOpened(...a),
  recordDisputeClosed: (...a: unknown[]) => recordDisputeClosed(...a),
  settleClawbacks: (...a: unknown[]) => settleClawbacks(...a),
}));

import { readFileSync } from "node:fs";
import { POST } from "@/app/api/webhooks/stripe/route";

function webhookReq(body: unknown) {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: JSON.stringify(body),
  });
}

const INVOICE = {
  id: "inv_1",
  number: "ZF-2026-0001",
  status: "ISSUED",
  type: "PLATFORM_FEE",
  claimId: null,
  totalCents: 4995,
  currency: "EUR",
  recipientFreelancerId: null,
};

afterEach(() => vi.clearAllMocks());

describe("POST /api/webhooks/stripe — single invoice", () => {
  it("marks one invoice PAID", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "paid", payment_intent: "pi_1", metadata: { invoiceId: "inv_1" } } },
    });
    invoiceFindUnique.mockResolvedValue(INVOICE);
    invoiceUpdate.mockResolvedValue({ ...INVOICE, status: "PAID" });

    const res = await POST(webhookReq({}));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.matched).toBe(true);
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv_1" }, data: expect.objectContaining({ status: "PAID", stripePaymentIntentId: "pi_1" }) }),
    );
  });

  it("is idempotent for an already-PAID invoice — no duplicate update or audit entry", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "paid", payment_intent: "pi_1", metadata: { invoiceId: "inv_1" } } },
    });
    invoiceFindUnique.mockResolvedValue({ ...INVOICE, status: "PAID" });

    const res = await POST(webhookReq({}));
    expect(res.status).toBe(200);
    expect(invoiceUpdate).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("fulfils the cancellation-penalty claim once the invoice that covers it is paid", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "paid", payment_intent: "pi_1", metadata: { invoiceId: "inv_2" } } },
    });
    invoiceFindUnique.mockResolvedValue({ ...INVOICE, id: "inv_2", type: "CANCELLATION_PENALTY", claimId: "claim_1" });
    invoiceUpdate.mockResolvedValue({});

    await POST(webhookReq({}));
    expect(fulfillPaidClaim).toHaveBeenCalledWith(expect.objectContaining({ id: "inv_2", claimId: "claim_1" }));
  });

  it("does not mark an unmatched invoice id paid", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_4",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "paid", metadata: { invoiceId: "nope" } } },
    });
    invoiceFindUnique.mockResolvedValue(null);

    const res = await POST(webhookReq({}));
    const json = await res.json();
    expect(json.matched).toBe(false);
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — a paid invoice", () => {
  it("settles an open clawback when a reopened invoice is paid again", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_7",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "paid", payment_intent: "pi_2", metadata: { invoiceId: "inv_1" } } },
    });
    invoiceFindUnique.mockResolvedValue(INVOICE);
    invoiceUpdate.mockResolvedValue({});
    await POST(webhookReq({}));
    expect(settleClawbacks).toHaveBeenCalledWith("inv_1");
  });

  it("still answers 200 when settling fails, because the invoice is already paid", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_8",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "paid", payment_intent: "pi_2", metadata: { invoiceId: "inv_1" } } },
    });
    invoiceFindUnique.mockResolvedValue(INVOICE);
    invoiceUpdate.mockResolvedValue({});
    settleClawbacks.mockRejectedValueOnce(new Error("kv down"));
    expect((await POST(webhookReq({}))).status).toBe(200);
  });
});

describe("POST /api/webhooks/stripe — refunds and disputes", () => {
  it.each([
    ["charge.refunded", recordChargeRefund],
    ["charge.dispute.created", recordDisputeOpened],
    ["charge.dispute.closed", recordDisputeClosed],
  ] as const)("%s goes to the clawback handling", async (type, handler) => {
    const object = { id: "x", payment_intent: "pi_1" };
    constructWebhookEvent.mockReturnValue({ id: `evt_${type}`, type, data: { object } });
    expect((await POST(webhookReq({}))).status).toBe(200);
    expect(handler).toHaveBeenCalledWith(object);
  });
});

describe("POST /api/webhooks/stripe — when processing fails", () => {
  const refundEvent = { id: "evt_fail", type: "charge.refunded", data: { object: { id: "ch_1" } } };

  it("answers 500 and gives the claim back, so Stripe's retry is really processed", async () => {
    constructWebhookEvent.mockReturnValue(refundEvent);
    recordChargeRefund.mockRejectedValueOnce(new Error("db down"));
    expect((await POST(webhookReq({}))).status).toBe(500);
    expect(releaseIdempotency).toHaveBeenCalledWith("stripe:evt_fail");
  });

  it("keeps the claim when processing succeeds", async () => {
    constructWebhookEvent.mockReturnValue(refundEvent);
    expect((await POST(webhookReq({}))).status).toBe(200);
    expect(releaseIdempotency).not.toHaveBeenCalled();
  });

  it("does not process an event twice", async () => {
    constructWebhookEvent.mockReturnValue(refundEvent);
    claimIdempotency.mockResolvedValueOnce(false);
    const res = await POST(webhookReq({}));
    expect((await res.json()).duplicate).toBe(true);
    expect(recordChargeRefund).not.toHaveBeenCalled();
  });

  it("still processes when the idempotency store is down, and has no claim to give back", async () => {
    constructWebhookEvent.mockReturnValue(refundEvent);
    claimIdempotency.mockRejectedValueOnce(new Error("redis down"));
    recordChargeRefund.mockRejectedValueOnce(new Error("db down"));
    expect((await POST(webhookReq({}))).status).toBe(500);
    expect(recordChargeRefund).toHaveBeenCalled();
    expect(releaseIdempotency).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — bulk invoice checkout", () => {
  it("marks every invoice in the invoiceIds metadata array PAID", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_5",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "payment",
          payment_status: "paid",
          payment_intent: "pi_bulk",
          metadata: { invoiceIds: JSON.stringify(["inv_1", "inv_2"]) },
        },
      },
    });
    invoiceFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ ...INVOICE, id: where.id, number: `ZF-${where.id}` }),
    );
    invoiceUpdate.mockResolvedValue({});

    const res = await POST(webhookReq({}));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.matched).toBe(true);
    expect(invoiceUpdate).toHaveBeenCalledTimes(2);
    expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv_1" } }));
    expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv_2" } }));
  });

  it("lets invoices share one payment intent, because a bulk checkout has only one", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const model = schema.slice(schema.indexOf("model Invoice {"), schema.indexOf("model InvoiceLine"));
    expect(model).toMatch(/stripePaymentIntentId\s+String\?\s*\n/);
    expect(model).toContain("@@index([stripePaymentIntentId])");
  });

  it("reports unmatched when payment_status is not paid, without touching any invoice", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_6",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "unpaid", metadata: { invoiceIds: JSON.stringify(["inv_1"]) } } },
    });

    const res = await POST(webhookReq({}));
    const json = await res.json();
    expect(json.matched).toBe(false);
    expect(invoiceFindUnique).not.toHaveBeenCalled();
  });
});
