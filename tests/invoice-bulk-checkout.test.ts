import { afterEach, describe, expect, it, vi } from "vitest";

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", () => ({ requirePrincipal: (...a: unknown[]) => requirePrincipal(...a) }));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const resolveEmployerScope = vi.fn();
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));

vi.mock("@/lib/profile/store", () => ({ getOrgProfileExtra: vi.fn().mockResolvedValue({ billingEmail: "billing@acme.nl" }) }));

const createBulkInvoiceCheckoutSession = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  createBulkInvoiceCheckoutSession: (...a: unknown[]) => createBulkInvoiceCheckoutSession(...a),
}));

const invoiceFindMany = vi.fn();
const invoiceUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findMany: (...a: unknown[]) => invoiceFindMany(...a),
      updateMany: (...a: unknown[]) => invoiceUpdateMany(...a),
    },
  },
}));

import { POST } from "@/app/api/invoices/bulk-checkout/route";

const PRINCIPAL = { userId: "u1", email: "werkgever@acme.nl" };

function req(body: unknown) {
  return new Request("http://localhost/api/invoices/bulk-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const INVOICE_A = { id: "inv_a", number: "ZF-0001", type: "PLATFORM_FEE", status: "ISSUED", totalCents: 1000, currency: "EUR", recipientTenantId: "tenant_1" };
const INVOICE_B = { id: "inv_b", number: "ZF-0002", type: "PLATFORM_FEE", status: "ISSUED", totalCents: 2000, currency: "EUR", recipientTenantId: "tenant_1" };

afterEach(() => vi.clearAllMocks());

describe("POST /api/invoices/bulk-checkout", () => {
  it("creates one combined Stripe session for all selected invoices and marks them with the session id", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["tenant_1"] });
    invoiceFindMany.mockResolvedValue([INVOICE_A, INVOICE_B]);
    createBulkInvoiceCheckoutSession.mockResolvedValue({ id: "cs_bulk_1", url: "https://checkout.stripe.com/cs_bulk_1" });
    invoiceUpdateMany.mockResolvedValue({ count: 2 });

    const res = await POST(req({ invoiceIds: ["inv_a", "inv_b"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe("https://checkout.stripe.com/cs_bulk_1");
    expect(createBulkInvoiceCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        invoices: [
          { invoiceId: "inv_a", number: "ZF-0001", description: "ZekerFlex platformfee", totalCents: 1000 },
          { invoiceId: "inv_b", number: "ZF-0002", description: "ZekerFlex platformfee", totalCents: 2000 },
        ],
        currency: "EUR",
      }),
    );
    expect(invoiceUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["inv_a", "inv_b"] } },
      data: { stripeCheckoutSessionId: "cs_bulk_1" },
    });
  });

  it("rejects when one of the invoices belongs to another tenant", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["tenant_1"] });
    invoiceFindMany.mockResolvedValue([INVOICE_A, { ...INVOICE_B, recipientTenantId: "tenant_other" }]);

    const res = await POST(req({ invoiceIds: ["inv_a", "inv_b"] }));
    expect(res.status).toBe(403);
    expect(createBulkInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects when one of the invoices is not ISSUED (already paid, or draft)", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["tenant_1"] });
    invoiceFindMany.mockResolvedValue([INVOICE_A, { ...INVOICE_B, status: "PAID" }]);

    const res = await POST(req({ invoiceIds: ["inv_a", "inv_b"] }));
    expect(res.status).toBe(412);
    expect(createBulkInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects an empty selection", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    const res = await POST(req({ invoiceIds: [] }));
    expect(res.status).toBe(422);
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it("404s when an invoice id does not exist at all", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["tenant_1"] });
    invoiceFindMany.mockResolvedValue([INVOICE_A]);

    const res = await POST(req({ invoiceIds: ["inv_a", "inv_missing"] }));
    expect(res.status).toBe(404);
  });
});
