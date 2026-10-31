import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findMany: async () => [{ id: "ander-a" }, { id: "eigen" }, { id: "ander-b" }] } },
}));
vi.mock("@/lib/auth", () => ({
  hasRole: (p: { grants: { role: string }[] }, ...roles: string[]) => p.grants.some((g) => roles.includes(g.role)),
}));

import { resolveEmployerScope } from "@/lib/dashboard/employer";
import type { Principal } from "@/lib/auth";

const principal = (grants: { role: string; organizationId: string }[]) =>
  ({ userId: "u1", grants: grants.map((g) => ({ ...g, locationIds: [] })), managedBranchIds: [] }) as unknown as Principal;

describe("resolveEmployerScope voor een beheerder", () => {
  it("zet het eigen bedrijf vooraan en houdt toegang tot alle bedrijven", async () => {
    const scope = await resolveEmployerScope(
      principal([
        { role: "PLATFORM_ADMIN", organizationId: "org_platform" },
        { role: "HQ_ADMIN", organizationId: "eigen" },
      ]),
    );
    expect(scope.tenantIds[0]).toBe("eigen");
    expect([...scope.tenantIds].sort()).toEqual(["ander-a", "ander-b", "eigen"]);
    expect(scope.branchIds).toBeNull();
  });

  it("laat de volgorde ongemoeid voor een beheerder zonder eigen bedrijf", async () => {
    const scope = await resolveEmployerScope(principal([{ role: "PLATFORM_ADMIN", organizationId: "org_platform" }]));
    expect(scope.tenantIds).toEqual(["ander-a", "eigen", "ander-b"]);
  });
});
