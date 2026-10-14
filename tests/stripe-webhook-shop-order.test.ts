import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const constructWebhookEvent = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({ constructWebhookEvent: (...a: unknown[]) => constructWebhookEvent(...a) }));

const claimIdempotency = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/redis", () => ({ claimIdempotency: (...a: unknown[]) => claimIdempotency(...a) }));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/claims/fulfillment", () => ({ fulfillPaidClaim: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/billing/api-subscription-sync", () => ({
  activateApiSubscription: vi.fn().mockResolvedValue(undefined),
  syncApiSubscription: vi.fn().mockResolvedValue(undefined),
}));

const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailShell: (title: string, body: string) => `<html>${title}${body}</html>`,
}));

const shopOrderFindUnique = vi.fn();
const shopOrderUpdate = vi.fn();
const shopOrderUpdateMany = vi.fn();
const shopVariantUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopOrder: {
      findUnique: (...a: unknown[]) => shopOrderFindUnique(...a),
      update: (...a: unknown[]) => shopOrderUpdate(...a),
      updateMany: (...a: unknown[]) => shopOrderUpdateMany(...a),
    },
    shopProductVariant: { updateMany: (...a: unknown[]) => shopVariantUpdateMany(...a) },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
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

const ORDER = {
  id: "order_1",
  status: "PENDING_PAYMENT",
  firstName: "Jan",
  lastName: "de Vries",
  email: "jan@example.nl",
  address: "Hoofdstraat 1",
  postalCode: "1000AA",
  city: "Amsterdam",
  itemsJson: [{ variantId: "var_1", name: "Werkschoenen S3", priceCents: 1999, qty: 2, imageUrl: "/shop/schoenen.jpg" }],
  subtotalCents: 3998,
  shippingCents: 495,
  totalCents: 4493,
};

afterEach(() => vi.clearAllMocks());

describe("POST /api/webhooks/stripe — shop orders", () => {
  it("marks a paid shop order RECEIVED and sends the admin + customer mails", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "payment",
          payment_status: "paid",
          payment_intent: "pi_123",
          metadata: { shopOrderId: "order_1" },
        },
      },
    });
    shopOrderFindUnique.mockResolvedValue(ORDER);
    shopOrderUpdate.mockResolvedValue({ ...ORDER, status: "RECEIVED" });

    const res = await POST(webhookReq({}));
    expect(res.status).toBe(200);

    expect(shopOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order_1" },
        data: expect.objectContaining({ status: "RECEIVED", stripePaymentIntentId: "pi_123" }),
      }),
    );
    expect(sendMail).toHaveBeenCalledTimes(2); // admin notify + customer confirmation
    expect(shopVariantUpdateMany).toHaveBeenCalledWith({
      where: { id: "var_1", stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
  });

  it("still marks the order paid but records an audit entry when a variant was oversold in the race window", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_1b",
      type: "checkout.session.completed",
      data: {
        object: { mode: "payment", payment_status: "paid", payment_intent: "pi_123", metadata: { shopOrderId: "order_1" } },
      },
    });
    shopOrderFindUnique.mockResolvedValue(ORDER);
    shopOrderUpdate.mockResolvedValue({ ...ORDER, status: "RECEIVED" });
    shopVariantUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(webhookReq({}));
    expect(res.status).toBe(200);
    expect(shopOrderUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RECEIVED" }) }));
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — a repeat delivery for an already-RECEIVED order sends no mail again", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_2",
      type: "checkout.session.completed",
      data: {
        object: { mode: "payment", payment_status: "paid", payment_intent: "pi_123", metadata: { shopOrderId: "order_1" } },
      },
    });
    shopOrderFindUnique.mockResolvedValue({ ...ORDER, status: "RECEIVED" });

    const res = await POST(webhookReq({}));
    expect(res.status).toBe(200);
    expect(shopOrderUpdate).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does not mark the order paid if Stripe reports payment_status !== paid", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "unpaid", metadata: { shopOrderId: "order_1" } } },
    });

    const res = await POST(webhookReq({}));
    expect(res.status).toBe(200);
    expect(shopOrderFindUnique).not.toHaveBeenCalled();
    expect(shopOrderUpdate).not.toHaveBeenCalled();
  });

  it("marks an abandoned checkout PAYMENT_FAILED on checkout.session.expired", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_4",
      type: "checkout.session.expired",
      data: { object: { metadata: { shopOrderId: "order_1" } } },
    });

    const res = await POST(webhookReq({}));
    expect(res.status).toBe(200);
    expect(shopOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order_1", status: "PENDING_PAYMENT" },
      data: { status: "PAYMENT_FAILED" },
    });
  });

  it("rejects a request with a missing/invalid signature", async () => {
    constructWebhookEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await POST(new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });
});
