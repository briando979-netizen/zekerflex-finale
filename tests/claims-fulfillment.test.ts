import { afterEach, describe, expect, it, vi } from "vitest";

const freelancerProfileFindUnique = vi.fn();
const tenantCreditCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => freelancerProfileFindUnique(...a) },
    tenantCredit: { create: (...a: unknown[]) => tenantCreditCreate(...a) },
  },
}));

const transferToConnectedAccount = vi.fn().mockResolvedValue({ transferId: "tr_1" });
vi.mock("@/lib/billing/stripe", () => ({ transferToConnectedAccount: (...a: unknown[]) => transferToConnectedAccount(...a) }));
vi.mock("@/lib/billing/sepa", () => ({ payoutEndToEndId: (id: string) => `ZF-${id}` }));

const getClaim = vi.fn();
const markClaimPaid = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/claims/store", () => ({
  getClaim: (...a: unknown[]) => getClaim(...a),
  markClaimPaid: (...a: unknown[]) => markClaimPaid(...a),
}));

const recordAudit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { fulfillPaidClaim } from "@/lib/claims/fulfillment";

const INVOICE = { id: "inv_1", number: "ZF-CP-2026-000001", totalCents: 5_000, currency: "EUR", claimId: "claim1" };

afterEach(() => vi.clearAllMocks());

describe("fulfillPaidClaim", () => {
  it("does nothing if the invoice has no claimId", async () => {
    await fulfillPaidClaim({ ...INVOICE, claimId: null });
    expect(getClaim).not.toHaveBeenCalled();
  });

  it("transfers the amount to the freelancer when they have a usable Connect account", async () => {
    getClaim.mockResolvedValue({ id: "claim1", direction: "freelancer_owed", freelancerUserId: "f1" });
    freelancerProfileFindUnique.mockResolvedValue({ id: "fp1", stripeConnectedAccountId: "acct_1", stripePayoutsEnabled: true });

    await fulfillPaidClaim(INVOICE);

    expect(transferToConnectedAccount).toHaveBeenCalledWith(
      expect.objectContaining({ destinationAccountId: "acct_1", amountCents: 5_000, endToEndId: "ZF-inv_1" }),
    );
    expect(markClaimPaid).toHaveBeenCalledWith("claim1");
  });

  it("flags for manual handling instead of transferring when Connect isn't set up", async () => {
    getClaim.mockResolvedValue({ id: "claim1", direction: "freelancer_owed", freelancerUserId: "f1" });
    freelancerProfileFindUnique.mockResolvedValue({ id: "fp1", stripeConnectedAccountId: null, stripePayoutsEnabled: false });

    await fulfillPaidClaim(INVOICE);

    expect(transferToConnectedAccount).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "claim.payout_blocked" }));
    expect(markClaimPaid).toHaveBeenCalledWith("claim1");
  });

  it("credits the employer tenant instead of transferring for an employer_owed claim", async () => {
    getClaim.mockResolvedValue({
      id: "claim2",
      direction: "employer_owed",
      employerTenantId: "t1",
      shiftTitle: "Magazijn shift",
    });

    await fulfillPaidClaim({ ...INVOICE, claimId: "claim2" });

    expect(transferToConnectedAccount).not.toHaveBeenCalled();
    expect(tenantCreditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "t1", amountCents: 5_000, sourceClaimId: "claim2" }) }),
    );
    expect(markClaimPaid).toHaveBeenCalledWith("claim2");
  });

  it("does nothing further if the claim can't be found", async () => {
    getClaim.mockResolvedValue(null);
    await fulfillPaidClaim(INVOICE);
    expect(markClaimPaid).not.toHaveBeenCalled();
  });
});
