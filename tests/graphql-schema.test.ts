import { afterEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";

// A manager role used to be able to list/fetch ANY tenant's shifts over
// GraphQL — the resolvers only checked "are you a manager", never which
// organization/branch. These tests pin the fix: the where-clause sent to
// Prisma must be scoped to the caller's own grants. Driven through the real
// route (not the `graphql` package directly) since this repo's graphql-yoga
// and top-level `graphql` package resolve to distinct instances, and a
// GraphQLSchema built by one is rejected by the other's isSchema() check.
const getPrincipalMock = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getPrincipal: () => getPrincipalMock() };
});

const shiftFindMany = vi.fn();
const shiftFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findMany: (...a: unknown[]) => shiftFindMany(...a),
      findFirst: (...a: unknown[]) => shiftFindFirst(...a),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  fixedWindow: async () => ({ ok: true, retryAfterSeconds: 0 }),
}));

import { POST } from "@/app/api/graphql/route";

afterEach(() => vi.clearAllMocks());

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: "u1",
    email: "m@example.com",
    fullName: "Manager",
    emailVerifiedAt: new Date(),
    grants: [],
    memberships: [],
    managedBranchIds: [],
    ...overrides,
  } as Principal;
}

function req(query: string, variables?: Record<string, unknown>): Request {
  return new Request("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
}

const SHIFTS_QUERY = `query { shifts { id } }`;
const SHIFT_QUERY = `query($id: ID!) { shift(id: $id) { id } }`;

describe("graphql shifts — tenant isolation", () => {
  it("scopes an unscoped LOCAL_MANAGER's list query to their own tenant", async () => {
    shiftFindMany.mockResolvedValue([]);
    getPrincipalMock.mockResolvedValue(
      principal({ grants: [{ role: "LOCAL_MANAGER", organizationId: "org1", locationIds: [] }] }),
    );

    const res = await POST(req(SHIFTS_QUERY));
    const body = await res.json();

    expect(body.errors).toBeUndefined();
    const where = shiftFindMany.mock.calls[0]![0].where;
    expect(where.branch).toEqual({ tenantId: { in: ["org1"] } });
  });

  it("scopes a branch-restricted LOCAL_MANAGER to just their branches", async () => {
    shiftFindMany.mockResolvedValue([]);
    getPrincipalMock.mockResolvedValue(
      principal({
        grants: [{ role: "LOCAL_MANAGER", organizationId: "org1", locationIds: ["b1", "b2"] }],
        managedBranchIds: ["b1", "b2"],
      }),
    );

    await POST(req(SHIFTS_QUERY));

    const where = shiftFindMany.mock.calls[0]![0].where;
    expect(where.branch).toEqual({ id: { in: ["b1", "b2"] } });
  });

  it("does not scope a PLATFORM_ADMIN's list query", async () => {
    shiftFindMany.mockResolvedValue([]);
    getPrincipalMock.mockResolvedValue(
      principal({ grants: [{ role: "PLATFORM_ADMIN", organizationId: "org1", locationIds: [] }] }),
    );

    await POST(req(SHIFTS_QUERY));

    const where = shiftFindMany.mock.calls[0]![0].where;
    expect(where.branch).toBeUndefined();
  });

  it("a freelancer still only sees OPEN shifts, unscoped by tenant", async () => {
    shiftFindMany.mockResolvedValue([]);
    getPrincipalMock.mockResolvedValue(
      principal({ grants: [{ role: "FREELANCER", organizationId: "org1", locationIds: [] }] }),
    );

    await POST(req(SHIFTS_QUERY));

    const where = shiftFindMany.mock.calls[0]![0].where;
    expect(where.status).toBe("OPEN");
    expect(where.branch).toBeUndefined();
  });

  it("shift(id) applies the same tenant scope via findFirst, so an out-of-scope id resolves to null", async () => {
    shiftFindFirst.mockResolvedValue(null);
    getPrincipalMock.mockResolvedValue(
      principal({ grants: [{ role: "LOCAL_MANAGER", organizationId: "org1", locationIds: [] }] }),
    );

    const res = await POST(req(SHIFT_QUERY, { id: "s1" }));
    const body = await res.json();

    expect(body.errors).toBeUndefined();
    expect(body.data?.shift).toBeNull();
    const where = shiftFindFirst.mock.calls[0]![0].where;
    expect(where).toEqual({ id: "s1", branch: { tenantId: { in: ["org1"] } } });
  });
});
