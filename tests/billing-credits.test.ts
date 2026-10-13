import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPendingTenantCredits } from "@/lib/billing/credits";

function makeTx(credits: Array<{ id: string; amountCents: number; reason: string; sourceClaimId: string }>) {
  const findMany = vi.fn().mockResolvedValue(credits);
  const update = vi.fn().mockResolvedValue(undefined);
  const create = vi.fn().mockResolvedValue(undefined);
  const invoiceLineCreate = vi.fn().mockResolvedValue(undefined);
  const invoiceUpdate = vi.fn().mockResolvedValue(undefined);
  const tx = {
    tenantCredit: { findMany, update, create },
    invoiceLine: { create: invoiceLineCreate },
    invoice: { update: invoiceUpdate },
  };
  return { tx, findMany, update, create, invoiceLineCreate, invoiceUpdate };
}

afterEach(() => vi.clearAllMocks());

describe("applyPendingTenantCredits", () => {
  it("does nothing when there are no unused credits", async () => {
    const { tx, invoiceLineCreate } = makeTx([]);
    await applyPendingTenantCredits(tx as never, "t1", "inv1", 10_000);
    expect(invoiceLineCreate).not.toHaveBeenCalled();
  });

  it("fully applies a credit smaller than the invoice and marks it applied", async () => {
    const { tx, update, invoiceLineCreate, invoiceUpdate } = makeTx([
      { id: "c1", amountCents: 2_000, reason: "x", sourceClaimId: "claim1" },
    ]);

    await applyPendingTenantCredits(tx as never, "t1", "inv1", 10_000);

    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { appliedAt: expect.any(Date), appliedToInvoiceId: "inv1" },
    });
    expect(invoiceLineCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountCents: -2_000 }) }),
    );
    expect(invoiceUpdate).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { subtotalCents: { decrement: 2_000 }, totalCents: { decrement: 2_000 } },
    });
  });

  it("partially consumes a credit larger than the invoice, leaving the remainder open", async () => {
    const { tx, update, create, invoiceLineCreate } = makeTx([
      { id: "c1", amountCents: 15_000, reason: "x", sourceClaimId: "claim1" },
    ]);

    await applyPendingTenantCredits(tx as never, "t1", "inv1", 10_000);

    // The original row shrinks by what was used, staying unapplied for next time.
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { amountCents: { decrement: 10_000 } } });
    // A separate fully-applied record captures what this invoice actually took.
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "t1", amountCents: 10_000, appliedToInvoiceId: "inv1" }),
    });
    expect(invoiceLineCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountCents: -10_000 }) }),
    );
  });

  it("spreads across multiple credits in creation order until the invoice is covered", async () => {
    const { tx, invoiceLineCreate } = makeTx([
      { id: "c1", amountCents: 3_000, reason: "x", sourceClaimId: "claim1" },
      { id: "c2", amountCents: 3_000, reason: "x", sourceClaimId: "claim2" },
      { id: "c3", amountCents: 3_000, reason: "x", sourceClaimId: "claim3" },
    ]);

    await applyPendingTenantCredits(tx as never, "t1", "inv1", 5_000);

    // 3000 + 2000 (partial of the second) = 5000 applied; the third is untouched.
    expect(invoiceLineCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountCents: -5_000 }) }),
    );
  });
});
