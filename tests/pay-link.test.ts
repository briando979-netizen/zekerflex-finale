import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { AUTH_SECRET: "test-secret-for-pay-links-0123456789abcdef", APP_BASE_URL: "https://www.zekerflex.com/" },
}));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { invoice: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } },
}));

const createInvoiceCheckoutSession = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  createInvoiceCheckoutSession: (...a: unknown[]) => createInvoiceCheckoutSession(...a),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue({ ok: true }) }));

import { payToken, payUrl, verifyPayToken } from "@/lib/billing/pay-link";
import { POST } from "@/app/api/betaal/[token]/route";

const INVOICE_ID = "cmg7x1abc000008l4a2b3c4d5";

afterEach(() => vi.clearAllMocks());

describe("pay link tokens", () => {
  it("round-trips an invoice id and builds the public URL", () => {
    const token = payToken(INVOICE_ID);
    expect(verifyPayToken(token)).toBe(INVOICE_ID);
    expect(payUrl(INVOICE_ID)).toBe(`https://www.zekerflex.com/betaal/${token}`);
  });

  it("rejects a forged signature", () => {
    const token = payToken(INVOICE_ID);
    const forged = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyPayToken(forged)).toBeNull();
  });

  it("rejects a valid signature moved onto another invoice id", () => {
    const sig = payToken(INVOICE_ID).split(".")[1];
    expect(verifyPayToken(`cmotherinvoice00000000000.${sig}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "abc", `${INVOICE_ID}.short`, `../${INVOICE_ID}`, `${payToken(INVOICE_ID)}x`]) {
      expect(verifyPayToken(bad)).toBeNull();
    }
  });
});

describe("POST /api/betaal/:token", () => {
  const call = (token: string) =>
    POST(new Request(`http://localhost/api/betaal/${token}`, { method: "POST" }), { params: Promise.resolve({ token }) });

  const OPEN = {
    id: INVOICE_ID,
    number: "PF-2026-00042",
    type: "PLATFORM_FEE",
    status: "ISSUED",
    totalCents: 12_345,
    currency: "EUR",
    recipientTenantId: "tenant_1",
    recipientFreelancerId: null,
  };

  it("starts a Stripe Checkout that returns to the public pay page", async () => {
    findUnique.mockResolvedValue(OPEN);
    createInvoiceCheckoutSession.mockResolvedValue({ id: "cs_123", url: "https://checkout.stripe.com/c/pay/cs_123" });
    const token = payToken(INVOICE_ID);

    const res = await call(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_123" });
    expect(createInvoiceCheckoutSession).toHaveBeenCalledWith({
      invoiceId: INVOICE_ID,
      number: "PF-2026-00042",
      description: "ZekerFlex platformfee",
      totalCents: 12_345,
      currency: "EUR",
      successPath: `/betaal/${token}?status=betaald`,
      cancelPath: `/betaal/${token}`,
    });
    expect(update).toHaveBeenCalledWith({ where: { id: INVOICE_ID }, data: { stripeCheckoutSessionId: "cs_123" } });
  });

  it("404s on a forged link without touching the database", async () => {
    const res = await call(`${INVOICE_ID}.AAAAAAAAAAAAAAAAAAAAAA`);
    expect(res.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("refuses an invoice that is already paid", async () => {
    findUnique.mockResolvedValue({ ...OPEN, status: "PAID" });
    const res = await call(payToken(INVOICE_ID));
    expect(res.status).toBe(412);
    expect(createInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses an invoice nobody owes (no debtor on it)", async () => {
    findUnique.mockResolvedValue({ ...OPEN, recipientTenantId: null });
    const res = await call(payToken(INVOICE_ID));
    expect(res.status).toBe(404);
  });
});
