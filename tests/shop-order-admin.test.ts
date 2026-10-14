import { afterEach, describe, expect, it, vi } from "vitest";

const requirePrincipal = vi.fn();
const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  requireRole: (...a: unknown[]) => requireRole(...a),
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailShell: (title: string, body: string) => `<html>${title}${body}</html>`,
  mailButton: (href: string, label: string) => `<a href="${href}">${label}</a>`,
}));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { shopOrder: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } },
}));

import { GET, PATCH } from "@/app/api/shop/orders/[id]/route";

const PRINCIPAL = { userId: "admin1", email: "admin@zekerflex.com" };

function patchReq(body: unknown) {
  return new Request("http://localhost/api/shop/orders/order_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("PATCH /api/shop/orders/:id", () => {
  it("e-mails the customer a tracking link only when the order newly transitions to SHIPPED with a tracking number", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    findUnique.mockResolvedValue({ status: "CONFIRMED" });
    update.mockResolvedValue({
      id: "order_1",
      status: "SHIPPED",
      firstName: "Jan",
      email: "jan@example.nl",
      carrier: "postnl",
      trackingNumber: "3STBJB123456",
    });

    const res = await PATCH(patchReq({ status: "SHIPPED" }), { params: Promise.resolve({ id: "order_1" }) });
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "jan@example.nl", subject: "Je bestelling is onderweg" }));
  });

  it("sends no mail when the order was already SHIPPED (no status transition)", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    findUnique.mockResolvedValue({ status: "SHIPPED" });
    update.mockResolvedValue({ id: "order_1", status: "SHIPPED", firstName: "Jan", email: "jan@example.nl", carrier: "postnl", trackingNumber: "3STBJB123456" });

    await PATCH(patchReq({ carrier: "postnl", trackingNumber: "3STBJB999999" }), { params: Promise.resolve({ id: "order_1" }) });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends no mail transitioning to SHIPPED without a tracking number yet", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    findUnique.mockResolvedValue({ status: "CONFIRMED" });
    update.mockResolvedValue({ id: "order_1", status: "SHIPPED", firstName: "Jan", email: "jan@example.nl", carrier: null, trackingNumber: null });

    await PATCH(patchReq({ status: "SHIPPED" }), { params: Promise.resolve({ id: "order_1" }) });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("GET /api/shop/orders/:id", () => {
  it("is public and returns only customer-safe fields", async () => {
    findUnique.mockResolvedValue({
      id: "order_1",
      status: "RECEIVED",
      firstName: "Jan",
      itemsJson: [{ name: "Werkschoenen S3", priceCents: 1999, qty: 2 }],
      totalCents: 4493,
      carrier: null,
      trackingNumber: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "order_1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.order.firstName).toBe("Jan");
    expect(requirePrincipal).not.toHaveBeenCalled();
  });

  it("404s for an unknown order id", async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
});
