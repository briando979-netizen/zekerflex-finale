import { afterEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";

// Until now a self-serve identity check that landed on "in_review" (e.g.
// because the automatic AI review couldn't reach an LLM — always true on
// this Vercel deployment) had no way to ever become VERIFIED or REJECTED.
// This is the admin action that resolves it by hand.
const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requirePrincipal: () => requirePrincipal() };
});

const identityVerificationFindFirst = vi.fn();
const identityVerificationUpdate = vi.fn();
const userUpdate = vi.fn();
const complianceDocumentUpdateMany = vi.fn();
const txn = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    identityVerification: { update: (...a: unknown[]) => identityVerificationUpdate(...a) },
    user: { update: (...a: unknown[]) => userUpdate(...a) },
    complianceDocument: { updateMany: (...a: unknown[]) => complianceDocumentUpdateMany(...a) },
  }),
);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    identityVerification: { findFirst: (...a: unknown[]) => identityVerificationFindFirst(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => txn(fn),
  },
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/admin/gebruikers/[id]/identiteit/[checkId]/route";

function admin(): Principal {
  return {
    userId: "admin1",
    email: "info@zekerflex.com",
    fullName: "Admin",
    emailVerifiedAt: new Date(),
    grants: [{ role: "PLATFORM_ADMIN", organizationId: "org_platform", locationIds: [] }],
    memberships: [],
    managedBranchIds: [],
  } as Principal;
}

function req(decision: string) {
  return new Request("http://localhost/api/admin/gebruikers/u1/identiteit/c1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}

const ctx = { params: Promise.resolve({ id: "u1", checkId: "c1" }) };

afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/gebruikers/[id]/identiteit/[checkId]", () => {
  it("approves a pending check, syncs kycStatus and the compliance doc", async () => {
    requirePrincipal.mockResolvedValue(admin());
    identityVerificationFindFirst.mockResolvedValue({ id: "c1", userId: "u1", documentType: "ID_CARD" });

    const res = await POST(req("approve"), ctx);

    expect(res.status).toBe(200);
    expect(identityVerificationUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "VERIFIED", verifiedAt: expect.any(Date) },
    });
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { kycStatus: "VERIFIED" } });
    expect(complianceDocumentUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", kind: "ID", status: "UPLOADED" },
      data: { status: "APPROVED" },
    });
  });

  it("rejects a pending check without touching the compliance doc for a driver's license", async () => {
    requirePrincipal.mockResolvedValue(admin());
    identityVerificationFindFirst.mockResolvedValue({ id: "c1", userId: "u1", documentType: "DRIVERS_LICENSE" });

    const res = await POST(req("reject"), ctx);

    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { kycStatus: "REJECTED" } });
    expect(complianceDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("404s for a check that doesn't belong to this user", async () => {
    requirePrincipal.mockResolvedValue(admin());
    identityVerificationFindFirst.mockResolvedValue(null);

    const res = await POST(req("approve"), ctx);

    expect(res.status).toBe(404);
    expect(identityVerificationUpdate).not.toHaveBeenCalled();
  });

  it("refuses a non-admin caller", async () => {
    requirePrincipal.mockResolvedValue({
      userId: "u2",
      email: "freelancer@example.com",
      fullName: "F",
      emailVerifiedAt: new Date(),
      grants: [{ role: "FREELANCER", organizationId: "org_platform", locationIds: [] }],
      memberships: [],
      managedBranchIds: [],
    } as Principal);

    const res = await POST(req("approve"), ctx);

    expect(res.status).toBe(403);
    expect(identityVerificationFindFirst).not.toHaveBeenCalled();
  });
});
