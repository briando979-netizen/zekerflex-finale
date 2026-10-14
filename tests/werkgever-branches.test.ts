import { afterEach, describe, expect, it, vi } from "vitest";

const getPrincipal = vi.fn();
const requireRole = vi.fn();
const resolveEmployerScope = vi.fn();
const branchFindMany = vi.fn();
const branchFindFirst = vi.fn();
const branchCreate = vi.fn();
const branchUpdate = vi.fn();
const branchDelete = vi.fn();
const shiftCount = vi.fn();
const timesheetCount = vi.fn();

vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      const p = await getPrincipal();
      if (!p) throw AppError.unauthenticated();
      return p;
    },
    requireRole: (...a: unknown[]) => requireRole(...a),
  };
});
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    branch: {
      findMany: (...a: unknown[]) => branchFindMany(...a),
      findFirst: (...a: unknown[]) => branchFindFirst(...a),
      create: (...a: unknown[]) => branchCreate(...a),
      update: (...a: unknown[]) => branchUpdate(...a),
      delete: (...a: unknown[]) => branchDelete(...a),
    },
    shift: { count: (...a: unknown[]) => shiftCount(...a) },
    timesheet: { count: (...a: unknown[]) => timesheetCount(...a) },
  },
}));

import { GET, POST } from "@/app/api/werkgever/branches/route";
import { PATCH, DELETE } from "@/app/api/werkgever/branches/[id]/route";

function jsonReq(body: unknown): Request {
  return new Request("https://app.example/api/werkgever/branches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PRINCIPAL = { userId: "u1", email: "a@b.nl" };
const VALID_BODY = {
  name: "Rotterdam centrum",
  addressLine: "Coolsingel 1",
  postalCode: "3012AA",
  city: "Rotterdam",
  latitude: 51.92,
  longitude: 4.48,
};

afterEach(() => vi.clearAllMocks());

describe("GET /api/werkgever/branches", () => {
  it("only lists PERMANENT branches for the caller's own tenant", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    branchFindMany.mockResolvedValue([{ id: "b1", name: "Rotterdam" }]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.branches).toHaveLength(1);
    expect(branchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1", kind: "PERMANENT" } }),
    );
  });
});

describe("POST /api/werkgever/branches", () => {
  it("rejects a principal without HQ_ADMIN/PLATFORM_ADMIN", async () => {
    const { AppError } = await import("@/lib/errors");
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => {
      throw AppError.forbidden("Requires one of: HQ_ADMIN, PLATFORM_ADMIN");
    });

    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(403);
    expect(branchCreate).not.toHaveBeenCalled();
  });

  it("creates a PERMANENT branch scoped to the caller's tenant", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    branchCreate.mockResolvedValue({ id: "b1", name: VALID_BODY.name });

    const res = await POST(jsonReq(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.branch.id).toBe("b1");
    expect(branchCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "t1", kind: "PERMANENT" }) }),
    );
  });

  it("rejects a malformed address", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });

    const res = await POST(jsonReq({ ...VALID_BODY, latitude: 999 }));
    expect(res.status).toBe(422);
    expect(branchCreate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/werkgever/branches/:id", () => {
  function delReq(id: string) {
    return DELETE(new Request("https://app.example", { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
  }

  it("refuses to delete a branch that already has shifts", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    branchFindFirst.mockResolvedValue({ id: "b1", name: "Rotterdam", tenantId: "t1" });
    shiftCount.mockResolvedValue(2);
    timesheetCount.mockResolvedValue(0);

    const res = await delReq("b1");
    expect(res.status).toBe(409);
    expect(branchDelete).not.toHaveBeenCalled();
  });

  it("deletes an unused branch", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    branchFindFirst.mockResolvedValue({ id: "b1", name: "Rotterdam", tenantId: "t1" });
    shiftCount.mockResolvedValue(0);
    timesheetCount.mockResolvedValue(0);

    const res = await delReq("b1");
    expect(res.status).toBe(200);
    expect(branchDelete).toHaveBeenCalledWith({ where: { id: "b1" } });
  });

  it("404s for a branch belonging to another tenant", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    branchFindFirst.mockResolvedValue(null);

    const res = await delReq("other-tenants-branch");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/werkgever/branches/:id", () => {
  it("only sends fields that were actually provided", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    branchFindFirst.mockResolvedValue({ id: "b1", name: "Oud", tenantId: "t1" });
    branchUpdate.mockResolvedValue({ id: "b1", name: "Nieuw" });

    const res = await PATCH(
      new Request("https://app.example", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nieuw" }),
      }),
      { params: Promise.resolve({ id: "b1" }) },
    );

    expect(res.status).toBe(200);
    expect(branchUpdate).toHaveBeenCalledWith({ where: { id: "b1" }, data: { name: "Nieuw" } });
  });
});
