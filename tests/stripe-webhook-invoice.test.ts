import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const constructWebhookEvent = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({ constructWebhookEvent: (...a: unknown[]) => constructWebhookEvent(...a) }));

const claimIdempotency = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/redis", () => ({ claimIdempotency: (...a: unknown[]) => claimIdempotency(...a) }));

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
