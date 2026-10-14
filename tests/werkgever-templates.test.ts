import { afterEach, describe, expect, it, vi } from "vitest";

const getPrincipal = vi.fn();
const resolveEmployerScope = vi.fn();
const saveTemplate = vi.fn();
const listTemplates = vi.fn();
const getTemplate = vi.fn();
const updateTemplate = vi.fn();
const deleteTemplate = vi.fn();

vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      const p = await getPrincipal();
      if (!p) throw AppError.unauthenticated();
      return p;
    },
  };
});
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shifts/templates", () => ({
  saveTemplate: (...a: unknown[]) => saveTemplate(...a),
  listTemplates: (...a: unknown[]) => listTemplates(...a),
  getTemplate: (...a: unknown[]) => getTemplate(...a),
  updateTemplate: (...a: unknown[]) => updateTemplate(...a),
  deleteTemplate: (...a: unknown[]) => deleteTemplate(...a),
}));

import { GET, POST } from "@/app/api/werkgever/templates/route";
import { PATCH, DELETE } from "@/app/api/werkgever/templates/[id]/route";

const PRINCIPAL = { userId: "u1", email: "a@b.nl" };
const VALID_BODY = { label: "Ochtenddienst", hourlyRateCents: 1700, breakMinutes: 30 };

function jsonReq(method: string, body: unknown) {
  return new Request("https://app.example/api/werkgever/templates", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("GET/POST /api/werkgever/templates", () => {
  it("lists the caller's own tenant templates", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    listTemplates.mockResolvedValue([{ id: "x1", label: "Ochtenddienst" }]);

    const res = await GET();
    const body = await res.json();
    expect(body.templates).toHaveLength(1);
    expect(listTemplates).toHaveBeenCalledWith("t1");
  });

  it("creates a template for the caller's tenant — no HQ_ADMIN gate required", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    saveTemplate.mockResolvedValue({ id: "x1", ...VALID_BODY });

    const res = await POST(jsonReq("POST", VALID_BODY));
    expect(res.status).toBe(201);
    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", createdById: "u1" }));
  });

  it("rejects a rate below the platform minimum", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });

    const res = await POST(jsonReq("POST", { ...VALID_BODY, hourlyRateCents: 100 }));
    expect(res.status).toBe(422);
    expect(saveTemplate).not.toHaveBeenCalled();
  });
});

describe("PATCH/DELETE /api/werkgever/templates/:id", () => {
  it("404s when the template doesn't belong to the caller's tenant", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    getTemplate.mockResolvedValue(null);

    const res = await DELETE(new Request("https://app.example", { method: "DELETE" }), { params: Promise.resolve({ id: "x1" }) });
    expect(res.status).toBe(404);
    expect(deleteTemplate).not.toHaveBeenCalled();
  });

  it("deletes an owned template", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    getTemplate.mockResolvedValue({ id: "x1", label: "Ochtenddienst" });

    const res = await DELETE(new Request("https://app.example", { method: "DELETE" }), { params: Promise.resolve({ id: "x1" }) });
    expect(res.status).toBe(200);
    expect(deleteTemplate).toHaveBeenCalledWith("t1", "x1");
  });

  it("only forwards fields that were provided to the patch", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    getTemplate.mockResolvedValue({ id: "x1", label: "Oud" });
    updateTemplate.mockResolvedValue({ id: "x1", label: "Nieuw" });

    const res = await PATCH(jsonReq("PATCH", { label: "Nieuw" }), { params: Promise.resolve({ id: "x1" }) });
    expect(res.status).toBe(200);
    expect(updateTemplate).toHaveBeenCalledWith("t1", "x1", { label: "Nieuw" });
  });
});
