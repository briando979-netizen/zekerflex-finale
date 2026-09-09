import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// getPrincipal() re-reads memberships from the database on every request
// instead of trusting the roles baked into the JWT at login time. This is the
// review's point 8 ("de databasecontrole moet altijd leidend blijven, niet
// het JWT") — these tests lock that behaviour in so a future change can't
// silently start trusting stale JWT claims again: a revoked role, a removed
// membership, or a disabled account must take effect on the very next
// request, without waiting for the token to expire.
// ---------------------------------------------------------------------------

const decodeSessionMock = vi.fn();
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, decodeSession: (...a: unknown[]) => decodeSessionMock(...a) };
});

const userFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: (...a: unknown[]) => userFindFirst(...a) } },
}));

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({ get: (...a: unknown[]) => cookieGet(...a) }),
  headers: () => ({ get: () => null }),
}));

import { getPrincipal, hasRole, requireRole, assertOrganizationAccess, assertBranchAccess } from "@/lib/auth";
import type { Principal } from "@/lib/auth";

beforeEach(() => {
  decodeSessionMock.mockReset();
  userFindFirst.mockReset();
  cookieGet.mockReset();
  cookieGet.mockReturnValue({ value: "some.jwt.token" });
});

describe("getPrincipal — session validity", () => {
  it("returns null when there is no session cookie at all", async () => {
    cookieGet.mockReturnValue(undefined);
    decodeSessionMock.mockResolvedValue(null);
    expect(await getPrincipal()).toBeNull();
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("returns null for an expired or otherwise invalid JWT (decodeSession -> null)", async () => {
    decodeSessionMock.mockResolvedValue(null);
    expect(await getPrincipal()).toBeNull();
    // Must short-circuit — an invalid token should never trigger a DB lookup.
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when the user behind a validly-signed token no longer exists", async () => {
    decodeSessionMock.mockResolvedValue({ sub: "usr_gone", email: "x@x.nl", name: "X", roles: [] });
    userFindFirst.mockResolvedValue(null);
    expect(await getPrincipal()).toBeNull();
  });

  it("returns null for a disabled account even with a validly-signed, unexpired token", async () => {
    decodeSessionMock.mockResolvedValue({ sub: "usr_1", email: "x@x.nl", name: "X", roles: [] });
    // disabledAt: null is baked into the query itself — a disabled user simply
    // never matches, mirroring what the mock below returns for it.
    userFindFirst.mockResolvedValue(null);
    const p = await getPrincipal();
    expect(p).toBeNull();
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ disabledAt: null }) }),
    );
  });
});

describe("getPrincipal — DB is authoritative over stale JWT claims", () => {
  it("reflects a role that was revoked after the token was issued (JWT still claims it, DB doesn't)", async () => {
    // Token was minted while the user was still HQ_ADMIN of org_a.
    decodeSessionMock.mockResolvedValue({
      sub: "usr_1",
      email: "x@x.nl",
      name: "X",
      roles: [{ role: "HQ_ADMIN", organizationId: "org_a", locationIds: [] }],
    });
    // But the membership has since been deleted in the database.
    userFindFirst.mockResolvedValue({
      id: "usr_1",
      email: "x@x.nl",
      fullName: "X",
      emailVerifiedAt: new Date(),
      memberships: [],
    });
    const p = await getPrincipal();
    expect(p?.grants).toEqual([]);
    expect(hasRole(p!, "HQ_ADMIN")).toBe(false);
  });

  it("reflects a role change (JWT says HQ_ADMIN, DB now says LOCAL_MANAGER)", async () => {
    decodeSessionMock.mockResolvedValue({
      sub: "usr_1",
      email: "x@x.nl",
      name: "X",
      roles: [{ role: "HQ_ADMIN", organizationId: "org_a", locationIds: [] }],
    });
    userFindFirst.mockResolvedValue({
      id: "usr_1",
      email: "x@x.nl",
      fullName: "X",
      emailVerifiedAt: new Date(),
      memberships: [
        { tenantId: "org_a", role: "LOCAL_MANAGER", scopedBranches: [{ branchId: "branch_ams" }] },
      ],
    });
    const p = await getPrincipal();
    expect(hasRole(p!, "HQ_ADMIN")).toBe(false);
    expect(hasRole(p!, "LOCAL_MANAGER")).toBe(true);
    expect(p!.managedBranchIds).toEqual(["branch_ams"]);
  });
});

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

describe("requireRole / hasRole", () => {
  it("throws forbidden when the principal has none of the required roles", () => {
    const p = principal({ grants: [{ role: "FREELANCER", organizationId: "org_a", locationIds: [] }] });
    expect(() => requireRole(p, "PLATFORM_ADMIN")).toThrow(/Requires one of/);
  });

  it("does not throw when the principal has one of the required roles", () => {
    const p = principal({ grants: [{ role: "PLATFORM_ADMIN", organizationId: "org_platform", locationIds: [] }] });
    expect(() => requireRole(p, "HQ_ADMIN", "PLATFORM_ADMIN")).not.toThrow();
  });
});

describe("assertOrganizationAccess — cross-tenant guard", () => {
  it("blocks access to an organization the principal has no membership in", () => {
    const p = principal({ grants: [{ role: "HQ_ADMIN", organizationId: "org_a", locationIds: [] }] });
    expect(() => assertOrganizationAccess(p, "org_b")).toThrow(/No membership/);
  });

  it("allows access to an organization the principal belongs to", () => {
    const p = principal({ grants: [{ role: "HQ_ADMIN", organizationId: "org_a", locationIds: [] }] });
    expect(() => assertOrganizationAccess(p, "org_a")).not.toThrow();
  });

  it("PLATFORM_ADMIN bypasses the check for any organization", () => {
    const p = principal({ grants: [{ role: "PLATFORM_ADMIN", organizationId: "org_platform", locationIds: [] }] });
    expect(() => assertOrganizationAccess(p, "org_never_seen")).not.toThrow();
  });
});

describe("assertBranchAccess — location scoping", () => {
  it("blocks a LOCAL_MANAGER scoped to other branches from a branch not in their grant", () => {
    const p = principal({
      grants: [{ role: "LOCAL_MANAGER", organizationId: "org_a", locationIds: ["branch_ams"] }],
    });
    expect(() => assertBranchAccess(p, "branch_utr", "org_a")).toThrow(/No access to this location/);
  });

  it("allows a LOCAL_MANAGER access to a branch explicitly in their grant", () => {
    const p = principal({
      grants: [{ role: "LOCAL_MANAGER", organizationId: "org_a", locationIds: ["branch_ams"] }],
    });
    expect(() => assertBranchAccess(p, "branch_ams", "org_a")).not.toThrow();
  });

  it("an unscoped LOCAL_MANAGER (empty locationIds) may access every branch of their org", () => {
    const p = principal({
      grants: [{ role: "LOCAL_MANAGER", organizationId: "org_a", locationIds: [] }],
    });
    expect(() => assertBranchAccess(p, "branch_anything", "org_a")).not.toThrow();
  });

  it("blocks a LOCAL_MANAGER of a different organization even for a branch id that happens to match", () => {
    const p = principal({
      grants: [{ role: "LOCAL_MANAGER", organizationId: "org_a", locationIds: ["branch_ams"] }],
    });
    expect(() => assertBranchAccess(p, "branch_ams", "org_b")).toThrow(/No membership/);
  });

  it("HQ_ADMIN of the org may access any of its branches without an explicit grant", () => {
    const p = principal({ grants: [{ role: "HQ_ADMIN", organizationId: "org_a", locationIds: [] }] });
    expect(() => assertBranchAccess(p, "branch_anything", "org_a")).not.toThrow();
  });

  it("PLATFORM_ADMIN bypasses branch scoping entirely", () => {
    const p = principal({ grants: [{ role: "PLATFORM_ADMIN", organizationId: "org_platform", locationIds: [] }] });
    expect(() => assertBranchAccess(p, "branch_anything", "org_never_seen")).not.toThrow();
  });

  it("a FREELANCER grant (no admin role) is never sufficient for branch access", () => {
    const p = principal({ grants: [{ role: "FREELANCER", organizationId: "org_a", locationIds: [] }] });
    expect(() => assertBranchAccess(p, "branch_x", "org_a")).toThrow(/No access to this location/);
  });
});
