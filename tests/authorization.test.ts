import { describe, expect, it } from "vitest";
import type { UserRole } from "@prisma/client";
import {
  assertBranchAccess,
  assertOrganizationAccess,
  requireRole,
  type Principal,
} from "@/lib/auth";

function principal(role: UserRole, organizationId = "org-a", locationIds: string[] = []): Principal {
  return {
    userId: "user-a",
    email: "a@example.test",
    fullName: "A",
    emailVerifiedAt: new Date(),
    grants: [{ role, organizationId, locationIds }],
    memberships: [{ role, tenantId: organizationId }],
    managedBranchIds: locationIds,
  };
}

describe("database-backed tenant authorization", () => {
  it("rejects a wrong role", () => {
    expect(() => requireRole(principal("FREELANCER"), "HQ_ADMIN")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("rejects a manipulated organization identifier", () => {
    expect(() => assertOrganizationAccess(principal("HQ_ADMIN"), "org-b")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("allows an HQ administrator only within its own organization", () => {
    expect(() => assertOrganizationAccess(principal("HQ_ADMIN"), "org-a")).not.toThrow();
    expect(() => assertBranchAccess(principal("HQ_ADMIN"), "branch-a", "org-a")).not.toThrow();
  });

  it("enforces a local manager's branch list", () => {
    const manager = principal("LOCAL_MANAGER", "org-a", ["branch-a"]);
    expect(() => assertBranchAccess(manager, "branch-a", "org-a")).not.toThrow();
    expect(() => assertBranchAccess(manager, "branch-b", "org-a")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("does not accept a branch grant through another organization", () => {
    expect(() => assertBranchAccess(
      principal("LOCAL_MANAGER", "org-a", ["branch-a"]),
      "branch-a",
      "org-b",
    )).toThrowError(expect.objectContaining({ status: 403 }));
  });
});
