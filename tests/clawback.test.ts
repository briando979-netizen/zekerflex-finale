import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));
const invoiceFindUnique = vi.fn();
const invoiceFindFirst = vi.fn();
const invoiceUpdate = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { invoice: { findUnique: (...a: unknown[]) => invoiceFindUnique(...a), findFirst: (...a: unknown[]) => invoiceFindFirst(...a), update: (...a: unknown[]) => invoiceUpdate(...a) } },
}));
vi.mock("@prisma/client", () => ({ InvoiceStatus: { PAID: "PAID", ISSUED: "ISSUED" } }));
const recordAudit = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
const alertOwner = vi.fn(async (..._a: unknown[]) => "sent");
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => alertOwner(...a) }));

import { listClawbacks, openExposureCents, recordInvoiceReversal, reverseByPaymentIntent } from "@/lib/billing/clawback";

afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("recordInvoiceReversal", () => {
  it("reverts a paid invoice to collectible and records exposure when the worker was already paid", async () => {
    invoiceFindUnique.mockResolvedValue({ id: "inv1", number: "F-001", status: "PAID", totalCents: 50000, recipientTenantId: "t1", payment: { status: "SETTLED" } });
    const cb = await recordInvoiceReversal({ invoiceId: "inv1", reason: "chargeback", providerRef: "evt_1" });
    expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv1" }, data: expect.objectContaining({ status: "ISSUED", paidAt: null }) }));
    expect(cb!.workerPaid).toBe(true);
    expect(await openExposureCents()).toBe(50000);
    expect(alertOwner.mock.calls[0]![0]).toMatchObject({ severity: "critical" });
  });

  it("warns (not critical) and no exposure when the worker was not yet paid", async () => {
    invoiceFindUnique.mockResolvedValue({ id: "inv2", number: "F-002", status: "PAID", totalCents: 30000, recipientTenantId: "t1", payment: { status: "PENDING" } });
    const cb = await recordInvoiceReversal({ invoiceId: "inv2", reason: "refund" });
    expect(cb!.workerPaid).toBe(false);
    expect(await openExposureCents()).toBe(0);
    expect(alertOwner.mock.calls[0]![0]).toMatchObject({ severity: "warning" });
  });

  it("is idempotent per (invoice, providerRef)", async () => {
    invoiceFindUnique.mockResolvedValue({ id: "inv1", number: "F-001", status: "PAID", totalCents: 50000, recipientTenantId: "t1", payment: { status: "SETTLED" } });
    await recordInvoiceReversal({ invoiceId: "inv1", reason: "chargeback", providerRef: "evt_1" });
    await recordInvoiceReversal({ invoiceId: "inv1", reason: "chargeback", providerRef: "evt_1" });
    expect((await listClawbacks())).toHaveLength(1);
  });

  it("reverseByPaymentIntent resolves the invoice via the stored payment intent", async () => {
    invoiceFindFirst.mockResolvedValue({ id: "inv9" });
    invoiceFindUnique.mockResolvedValue({ id: "inv9", number: "F-009", status: "PAID", totalCents: 10000, recipientTenantId: "t2", payment: { status: "SETTLED" } });
    const cb = await reverseByPaymentIntent("pi_123", "chargeback", "evt_9");
    expect(invoiceFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { stripePaymentIntentId: "pi_123" } }));
    expect(cb!.invoiceNumber).toBe("F-009");
  });
});
