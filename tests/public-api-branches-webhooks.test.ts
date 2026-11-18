import { describe, it, expect, vi, beforeEach } from "vitest";

// Nieuwe publieke endpoints (GET /branches, GET /webhooks, DELETE /webhooks/{id}).
// Bewaakt: strikte tenantscheiding (een ander = 404, geen 403), geen sleutel = 401,
// het webhook-geheim komt nooit terug in GET, en een audit-regel bij DELETE.

const h = vi.hoisted(() => ({
  requireApiKey: vi.fn(),
  deleteMany: vi.fn(),
  findManyWebhooks: vi.fn(),
  findManyBranches: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "x".repeat(40), APP_BASE_URL: "https://zekerflex.test", NODE_ENV: "test" } }));
vi.mock("@/lib/api-keys/gateway", () => ({ requireApiKey: h.requireApiKey }));
vi.mock("@/lib/http/rate-limit-headers", () => ({ rateLimitHeaders: () => ({}) }));
vi.mock("@/lib/audit", () => ({ recordAudit: h.recordAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookSubscription: { deleteMany: h.deleteMany, findMany: h.findManyWebhooks },
    branch: { findMany: h.findManyBranches },
  },
}));

import { AppError } from "@/lib/errors";
import { GET as getBranches } from "@/app/api/public/v1/branches/route";
import { GET as getWebhooks } from "@/app/api/public/v1/webhooks/route";
import { DELETE as deleteWebhook } from "@/app/api/public/v1/webhooks/[id]/route";

const req = (method = "GET") => new Request("https://zekerflex.test/api/public/v1/x", { method });
const gate = (tenantId: string | null) => ({ key: { id: "key_1", tenantId, scopes: ["shifts:read", "webhooks:manage"] }, rate: {} });

beforeEach(() => {
  h.requireApiKey.mockReset();
  h.deleteMany.mockReset();
  h.findManyWebhooks.mockReset();
  h.findManyBranches.mockReset();
  h.recordAudit.mockReset();
});

describe("DELETE /webhooks/{id} — tenantscheiding", () => {
  it("een abonnement van een andere tenant geeft 404, niet 403", async () => {
    h.requireApiKey.mockResolvedValue(gate("tenant-a"));
    h.deleteMany.mockResolvedValue({ count: 0 }); // niets van tenant-a met dit id
    const res = await deleteWebhook(req("DELETE"), { params: Promise.resolve({ id: "wh_van_tenant_b" }) });
    expect(res.status).toBe(404);
    // de where bevat altijd de eigen tenantId, dus je kunt nooit die van een ander raken
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { id: "wh_van_tenant_b", tenantId: "tenant-a" } });
    expect(h.recordAudit).not.toHaveBeenCalled();
  });

  it("een eigen abonnement wordt verwijderd (200) en gelogd", async () => {
    h.requireApiKey.mockResolvedValue(gate("tenant-a"));
    h.deleteMany.mockResolvedValue({ count: 1 });
    const res = await deleteWebhook(req("DELETE"), { params: Promise.resolve({ id: "wh_1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: "wh_1", deleted: true } });
    expect(h.recordAudit).toHaveBeenCalledTimes(1);
    expect(h.recordAudit.mock.calls[0]?.[0]).toMatchObject({ action: "api.webhook.deleted", targetId: "wh_1" });
  });

  it("zonder sleutel geeft 401", async () => {
    h.requireApiKey.mockRejectedValue(AppError.unauthenticated("Ongeldige of ontbrekende API-sleutel"));
    const res = await deleteWebhook(req("DELETE"), { params: Promise.resolve({ id: "wh_1" }) });
    expect(res.status).toBe(401);
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it("een platformsleutel zonder organisatie geeft 412", async () => {
    h.requireApiKey.mockResolvedValue(gate(null));
    const res = await deleteWebhook(req("DELETE"), { params: Promise.resolve({ id: "wh_1" }) });
    expect(res.status).toBe(412);
    expect(h.deleteMany).not.toHaveBeenCalled();
  });
});

describe("GET /webhooks — geen geheim, eigen tenant", () => {
  it("vraagt alleen velden zonder secretCiphertext en filtert op de eigen tenant", async () => {
    h.requireApiKey.mockResolvedValue(gate("tenant-a"));
    h.findManyWebhooks.mockResolvedValue([{ id: "wh_1", url: "https://x.test/hook", eventTypes: ["shift.matched"], active: true, createdAt: new Date("2026-11-01T00:00:00Z") }]);
    const res = await getWebhooks(req());
    expect(res.status).toBe(200);
    const arg = h.findManyWebhooks.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ tenantId: "tenant-a" });
    expect(Object.keys(arg?.select ?? {})).not.toContain("secretCiphertext");
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("zonder sleutel geeft 401", async () => {
    h.requireApiKey.mockRejectedValue(AppError.unauthenticated("x"));
    const res = await getWebhooks(req());
    expect(res.status).toBe(401);
  });
});

describe("GET /branches — eigen tenant", () => {
  it("filtert op de eigen tenant", async () => {
    h.requireApiKey.mockResolvedValue(gate("tenant-a"));
    h.findManyBranches.mockResolvedValue([{ id: "br_1", name: "Centrum", city: "Groningen", postalCode: "9711AA" }]);
    const res = await getBranches(req());
    expect(res.status).toBe(200);
    expect(h.findManyBranches.mock.calls[0]?.[0]?.where).toEqual({ tenantId: "tenant-a" });
  });

  it("een platformsleutel zonder organisatie geeft 412", async () => {
    h.requireApiKey.mockResolvedValue(gate(null));
    const res = await getBranches(req());
    expect(res.status).toBe(412);
    expect(h.findManyBranches).not.toHaveBeenCalled();
  });
});
