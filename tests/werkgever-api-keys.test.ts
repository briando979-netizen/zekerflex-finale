import { afterEach, describe, expect, it, vi } from "vitest";

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", () => ({ requirePrincipal: () => requirePrincipal() }));

const resolveEmployerScope = vi.fn();
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));

const resolveTenantPlan = vi.fn();
vi.mock("@/lib/api-plans/resolve", () => ({ resolveTenantPlan: (...a: unknown[]) => resolveTenantPlan(...a) }));

const createApiKey = vi.fn();
const listApiKeys = vi.fn();
vi.mock("@/lib/integrations/api-keys", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/api-keys")>("@/lib/integrations/api-keys");
  return {
    ...actual,
    createApiKey: (...a: unknown[]) => createApiKey(...a),
    listApiKeys: (...a: unknown[]) => listApiKeys(...a),
  };
});

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue({ ok: true }) }));

import { POST, GET } from "@/app/api/werkgever/api-keys/route";

function postReq(body: unknown): Request {
  return new Request("https://app.example/api/werkgever/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("POST /api/werkgever/api-keys", () => {
  it("refuses an account with no organization", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1", email: "a@b.nl" });
    resolveEmployerScope.mockResolvedValue({ tenantIds: [], branchIds: null });

    const res = await POST(postReq({ name: "Test", scopes: ["shifts:read"] }));
    expect(res.status).toBe(412);
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it("rejects a scope the tenant's current plan doesn't allow", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1", email: "a@b.nl" });
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    resolveTenantPlan.mockResolvedValue({ key: "free", label: "Free", scopes: ["shifts:read", "timesheets:read"] });

    const res = await POST(postReq({ name: "Test", scopes: ["shifts:write"] }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.message).toContain("shifts:write");
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it("creates a key scoped to the tenant when every requested scope is within the plan", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1", email: "a@b.nl" });
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    resolveTenantPlan.mockResolvedValue({ key: "starter", label: "Starter", scopes: ["shifts:read", "shifts:write", "timesheets:read", "webhooks:manage"] });
    createApiKey.mockResolvedValue({ id: "key_1", prefix: "zf_live_abcd1234", raw: "zf_live_abcd1234secret" });

    const res = await POST(postReq({ name: "Mijn koppeling", scopes: ["shifts:read", "shifts:write"] }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.raw).toBe("zf_live_abcd1234secret");
    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", scopes: ["shifts:read", "shifts:write"] }),
    );
  });
});

describe("GET /api/werkgever/api-keys", () => {
  it("only returns keys belonging to the caller's own tenant", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1", email: "a@b.nl" });
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    listApiKeys.mockResolvedValue([
      { id: "k1", tenant: { id: "t1" } },
      { id: "k2", tenant: { id: "t2" } },
      { id: "k3", tenant: null },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.keys).toEqual([{ id: "k1", tenant: { id: "t1" } }]);
  });
});
