import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const createCheckoutSession = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  createShopOrderCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
}));

const findMany = vi.fn();
const orderCreate = vi.fn();
const orderUpdate = vi.fn();
const orderFindMany = vi.fn();
const getPrincipal = vi.fn();
const requireRole = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopProduct: { findMany: (...a: unknown[]) => findMany(...a) },
    shopOrder: {
      create: (...a: unknown[]) => orderCreate(...a),
      update: (...a: unknown[]) => orderUpdate(...a),
      findMany: (...a: unknown[]) => orderFindMany(...a),
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  getPrincipal: (...a: unknown[]) => getPrincipal(...a),
  requireRole: (...a: unknown[]) => requireRole(...a),
}));

import { GET, POST } from "@/app/api/shop/orders/route";

function req(body: unknown) {
  return new Request("http://localhost/api/shop/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PRODUCT = { id: "prod_1", name: "Werkschoenen S3", priceCents: 1999, imageUrl: "/shop/schoenen.jpg" };

const valid = {
  firstName: "Jan",
  lastName: "de Vries",
  email: "jan@example.nl",
  address: "Hoofdstraat 1",
  postalCode: "1000AA",
  city: "Amsterdam",
  items: [{ productId: "prod_1", qty: 2 }],
};

afterEach(() => vi.clearAllMocks());

describe("POST /api/shop/orders", () => {
  it("creates a PENDING_PAYMENT order, re-pricing server-side, and starts a Stripe Checkout session", async () => {
    findMany.mockResolvedValue([PRODUCT]);
    orderCreate.mockResolvedValue({ id: "order_1" });
    orderUpdate.mockResolvedValue({});
    createCheckoutSession.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/cs_test_1" });

    const res = await POST(req(valid));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.checkoutUrl).toBe("https://checkout.stripe.com/cs_test_1");
    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING_PAYMENT",
          email: "jan@example.nl",
          subtotalCents: 3998,
          shippingCents: 495,
          totalCents: 4493,
          itemsJson: [{ productId: "prod_1", name: "Werkschoenen S3", priceCents: 1999, qty: 2, imageUrl: "/shop/schoenen.jpg" }],
        }),
      }),
    );
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order_1",
        email: "jan@example.nl",
        shippingCents: 495,
        lines: [{ name: "Werkschoenen S3", priceCents: 1999, qty: 2 }],
      }),
    );
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "order_1" }, data: { stripeSessionId: "cs_test_1" } });
  });

  it("is free shipping at or above €50 subtotal", async () => {
    findMany.mockResolvedValue([{ id: "prod_1", name: "Werkschoenen S3", priceCents: 2500, imageUrl: null }]);
    orderCreate.mockResolvedValue({ id: "order_2" });
    orderUpdate.mockResolvedValue({});
    createCheckoutSession.mockResolvedValue({ id: "cs_2", url: "https://checkout.stripe.com/cs_2" });

    await POST(req({ ...valid, items: [{ productId: "prod_1", qty: 2 }] }));

    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtotalCents: 5000, shippingCents: 0, totalCents: 5000 }),
      }),
    );
  });

  it("ignores any client-sent price and never trusts it", async () => {
    findMany.mockResolvedValue([PRODUCT]);
    orderCreate.mockResolvedValue({ id: "order_3" });
    orderUpdate.mockResolvedValue({});
    createCheckoutSession.mockResolvedValue({ id: "cs_3", url: "https://checkout.stripe.com/cs_3" });

    await POST(req({ ...valid, items: [{ productId: "prod_1", qty: 1, priceCents: 1 }] }));

    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subtotalCents: 1999 }) }),
    );
  });

  it("rejects an order where none of the items are still active/available", async () => {
    findMany.mockResolvedValue([]);
    const res = await POST(req(valid));
    expect(res.status).toBe(422);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("rejects a request with no items", async () => {
    const res = await POST(req({ ...valid, items: [] }));
    expect(res.status).toBe(422);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("rejects a request with an invalid email", async () => {
    const res = await POST(req({ ...valid, email: "not-an-email" }));
    expect(res.status).toBe(422);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("marks the order PAYMENT_FAILED and surfaces an error when Stripe can't start a session", async () => {
    findMany.mockResolvedValue([PRODUCT]);
    orderCreate.mockResolvedValue({ id: "order_4" });
    orderUpdate.mockResolvedValue({});
    createCheckoutSession.mockRejectedValue(new Error("stripe down"));

    const res = await POST(req(valid));
    expect(res.status).toBe(503);
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "order_4" }, data: { status: "PAYMENT_FAILED" } });
  });
});

describe("GET /api/shop/orders", () => {
  it("requires an authenticated admin principal", async () => {
    getPrincipal.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/shop/orders"));
    expect(res.status).toBe(401);
  });

  it("returns the order list for a platform admin", async () => {
    getPrincipal.mockResolvedValue({ userId: "u1" });
    requireRole.mockImplementation(() => undefined);
    const orders = [{ id: "order_1" }];
    orderFindMany.mockResolvedValue(orders);

    const res = await GET(new Request("http://localhost/api/shop/orders"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.orders).toEqual(orders);
  });
});
