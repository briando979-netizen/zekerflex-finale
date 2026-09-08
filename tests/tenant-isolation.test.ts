import { describe, expect, it, vi } from "vitest";

// --- mocks (hoisted) -------------------------------------------------------
const tenantFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: (...a: unknown[]) => tenantFindMany(...a) },
  },
}));

import { resolveEmployerScope } from "@/lib/dashboard/employer";
import type { Principal } from "@/lib/auth";

// ---------------------------------------------------------------------------
// resolveEmployerScope is the shared tenant/branch-scoping primitive reused
// across the employer- and admin-facing surface (facturen, uren, disputes,
// claims). A regression here silently reopens cross-tenant data leaks like
// the one found in the disputes console: an HQ_ADMIN with no explicit branch
// grant must be scoped to their OWN tenant(s), never fall through to "every
// row" the way an unscoped query would.
// ---------------------------------------------------------------------------

function principal(overrides: Partial<Principal>): Principal {
  return {
    userId: "usr_1",
    email: "user@example.com",
    fullName: "Test User",
    emailVerifiedAt: new Date(),
    grants: [],
    memberships: [],
    managedBranchIds: [],
    ...overrides,
  } as Principal;
}

describe("resolveEmployerScope", () => {
  it("scopes an HQ_ADMIN to only their own tenant, with no branch restriction", async () => {
    const p = principal({
      grants: [{ role: "HQ_ADMIN", organizationId: "org_babycare", locationIds: [] }],
    });
    const scope = await resolveEmployerScope(p);
    expect(scope.tenantIds).toEqual(["org_babycare"]);
    expect(scope.branchIds).toBeNull();
    expect(tenantFindMany).not.toHaveBeenCalled();
  });

  it("never includes a tenant the principal has no grant for", async () => {
    const p = principal({
      grants: [{ role: "HQ_ADMIN", organizationId: "org_babycare", locationIds: [] }],
    });
    const scope = await resolveEmployerScope(p);
    expect(scope.tenantIds).not.toContain("org_other_company");
  });

  it("gives PLATFORM_ADMIN every employer tenant, independent of their own grants", async () => {
    tenantFindMany.mockResolvedValueOnce([{ id: "org_a" }, { id: "org_b" }]);
    const p = principal({
      grants: [{ role: "PLATFORM_ADMIN", organizationId: "org_platform", locationIds: [] }],
    });
    const scope = await resolveEmployerScope(p);
    expect(scope.tenantIds).toEqual(["org_a", "org_b"]);
    expect(scope.branchIds).toBeNull();
  });

  it("restricts a branch-scoped LOCAL_MANAGER to exactly their assigned branches", async () => {
    const p = principal({
      grants: [
        {
          role: "LOCAL_MANAGER",
          organizationId: "org_babycare",
          locationIds: ["branch_ams", "branch_utr"],
        },
      ],
      managedBranchIds: ["branch_ams", "branch_utr"],
    });
    const scope = await resolveEmployerScope(p);
    expect(scope.tenantIds).toEqual(["org_babycare"]);
    expect(scope.branchIds).toEqual(["branch_ams", "branch_utr"]);
  });

  it("falls back to tenant-wide access when a LOCAL_MANAGER grant has no branches (never an unscoped read)", async () => {
    const p = principal({
      grants: [{ role: "LOCAL_MANAGER", organizationId: "org_babycare", locationIds: [] }],
      managedBranchIds: [],
    });
    const scope = await resolveEmployerScope(p);
    expect(scope.tenantIds).toEqual(["org_babycare"]);
    // branchIds: null means "every branch of tenantIds" — still tenant-bounded,
    // never the platform-wide, tenant-less read that caused the disputes leak.
    expect(scope.branchIds).toBeNull();
  });

  it("deduplicates tenants across multiple grants for the same organization", async () => {
    const p = principal({
      grants: [
        { role: "HQ_ADMIN", organizationId: "org_babycare", locationIds: [] },
        { role: "DISPUTE_MANAGER", organizationId: "org_babycare", locationIds: [] },
      ],
    });
    const scope = await resolveEmployerScope(p);
    expect(scope.tenantIds).toEqual(["org_babycare"]);
  });

  it("grants no tenant access to a principal with only a FREELANCER grant", async () => {
    const p = principal({
      grants: [{ role: "FREELANCER", organizationId: "org_babycare", locationIds: [] }],
    });
    const scope = await resolveEmployerScope(p);
    expect(scope.tenantIds).toEqual([]);
  });
});
