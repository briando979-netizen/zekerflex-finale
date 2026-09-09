import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// lib/auth/handlers.ts wraps the requirePrincipal/requireRole/assert* +
// try/catch boilerplate every protected route repeats by hand. These tests
// exercise the wrappers in isolation (auth primitives mocked) to make sure
// the boundary itself is correct: auth failures never reach the handler,
// role/org/branch checks run before the handler body, and every error path
// — expected (AppError) and unexpected (a plain throw) — produces the same
// JSON error shape a hand-written route would.
// ---------------------------------------------------------------------------

const requirePrincipalMock = vi.fn();
const requireRoleMock = vi.fn();
const assertOrganizationAccessMock = vi.fn();
const assertBranchAccessMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => requirePrincipalMock(...a),
  requireRole: (...a: unknown[]) => requireRoleMock(...a),
  assertOrganizationAccess: (...a: unknown[]) => assertOrganizationAccessMock(...a),
  assertBranchAccess: (...a: unknown[]) => assertBranchAccessMock(...a),
}));

import { NextResponse } from "next/server";
import { withAuth, withAdminAccess, withOrganizationAccess, withBranchAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";

const PRINCIPAL = { userId: "usr_1", email: "u@x.nl", fullName: "U", grants: [] };

beforeEach(() => {
  requirePrincipalMock.mockReset();
  requireRoleMock.mockReset();
  assertOrganizationAccessMock.mockReset();
  assertBranchAccessMock.mockReset();
});

async function bodyOf(res: NextResponse): Promise<unknown> {
  return res.json();
}

describe("withAuth", () => {
  it("returns 401 and never calls the handler when there is no valid session", async () => {
    requirePrincipalMock.mockRejectedValue(AppError.unauthenticated());
    const handler = vi.fn();
    const res = await withAuth(handler)(new Request("http://x/"), { params: {} });
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler with the resolved principal attached to ctx", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const ctx = { params: { id: "abc" } };
    await withAuth(handler)(new Request("http://x/"), ctx);
    expect(handler).toHaveBeenCalledWith(expect.anything(), { params: { id: "abc" }, principal: PRINCIPAL });
  });

  it("defaults ctx to an empty params object when the route has no dynamic segment", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    await withAuth(handler)(new Request("http://x/"));
    expect(handler).toHaveBeenCalledWith(expect.anything(), { params: {}, principal: PRINCIPAL });
  });

  it("converts an AppError thrown by the handler into the matching status + code", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    const handler = vi.fn().mockRejectedValue(AppError.forbidden("nope"));
    const res = await withAuth(handler)(new Request("http://x/"), { params: {} });
    expect(res.status).toBe(403);
    expect(await bodyOf(res)).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("converts an unexpected thrown error into a generic 500, never leaking the raw error", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    const handler = vi.fn().mockRejectedValue(new Error("db connection string leaked here"));
    const res = await withAuth(handler)(new Request("http://x/"), { params: {} });
    expect(res.status).toBe(500);
    const body = (await bodyOf(res)) as { error: { message: string } };
    expect(body.error.message).not.toContain("db connection string");
  });
});

describe("withAdminAccess", () => {
  it("checks the role before the handler runs, and rejects when it fails", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    requireRoleMock.mockImplementation(() => {
      throw AppError.forbidden("Requires one of: PLATFORM_ADMIN");
    });
    const handler = vi.fn();
    const res = await withAdminAccess(["PLATFORM_ADMIN"], handler)(new Request("http://x/"), { params: {} });
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(requireRoleMock).toHaveBeenCalledWith(PRINCIPAL, "PLATFORM_ADMIN");
  });

  it("runs the handler when the role check passes", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    requireRoleMock.mockReturnValue(undefined);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const res = await withAdminAccess(["PLATFORM_ADMIN"], handler)(new Request("http://x/"), { params: {} });
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("still returns 401 (not 403) when there is no session at all", async () => {
    requirePrincipalMock.mockRejectedValue(AppError.unauthenticated());
    const handler = vi.fn();
    const res = await withAdminAccess(["PLATFORM_ADMIN"], handler)(new Request("http://x/"), { params: {} });
    expect(res.status).toBe(401);
    expect(requireRoleMock).not.toHaveBeenCalled();
  });
});

describe("withOrganizationAccess", () => {
  it("resolves the organization id after auth, then asserts access before the handler", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    const resolveOrgId = vi.fn().mockResolvedValue("org_a");
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    await withOrganizationAccess(resolveOrgId, handler)(new Request("http://x/"), { params: { id: "inv_1" } });
    expect(resolveOrgId).toHaveBeenCalled();
    expect(assertOrganizationAccessMock).toHaveBeenCalledWith(PRINCIPAL, "org_a");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("blocks the handler when the org assertion throws (cross-tenant attempt)", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    assertOrganizationAccessMock.mockImplementation(() => {
      throw AppError.forbidden("No membership for this organization");
    });
    const handler = vi.fn();
    const res = await withOrganizationAccess(() => "org_other", handler)(new Request("http://x/"), {
      params: {},
    });
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("withBranchAccess", () => {
  it("resolves branch+tenant ids, asserts branch access, then runs the handler", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    const resolveIds = vi.fn().mockResolvedValue({ branchId: "branch_ams", tenantId: "org_a" });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    await withBranchAccess(resolveIds, handler)(new Request("http://x/"), { params: {} });
    expect(assertBranchAccessMock).toHaveBeenCalledWith(PRINCIPAL, "branch_ams", "org_a");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("blocks the handler when branch access is denied", async () => {
    requirePrincipalMock.mockResolvedValue(PRINCIPAL);
    assertBranchAccessMock.mockImplementation(() => {
      throw AppError.forbidden("No access to this location");
    });
    const handler = vi.fn();
    const res = await withBranchAccess(
      () => ({ branchId: "branch_x", tenantId: "org_a" }),
      handler,
    )(new Request("http://x/"), { params: {} });
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});
