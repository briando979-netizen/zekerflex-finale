import { afterEach, describe, expect, it, vi } from "vitest";

const verifyApiKey = vi.fn();
vi.mock("@/lib/integrations/api-keys", () => ({
  verifyApiKey: (...a: unknown[]) => verifyApiKey(...a),
  hasScope: (key: { scopes: string[] }, scope: string) => key.scopes.includes(scope),
}));

const enforceRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...a) }));

const resolveTenantPlan = vi.fn();
vi.mock("@/lib/api-plans/resolve", () => ({ resolveTenantPlan: (...a: unknown[]) => resolveTenantPlan(...a) }));

import { requireApiKey, readApiKey } from "@/lib/api-keys/gateway";
import { AppError } from "@/lib/errors";

afterEach(() => vi.clearAllMocks());

function req(headers: Record<string, string>): Request {
  return new Request("https://api.example/v1/shifts", { headers });
}

const RATE_OK = { ok: true, count: 1, limit: 120, remaining: 119, retryAfterSeconds: 0, resetSeconds: 60 };

describe("readApiKey", () => {
  it("reads a zf_live_ bearer token", () => {
    expect(readApiKey(req({ authorization: "Bearer zf_live_abc" }))).toBe("zf_live_abc");
  });
  it("reads an x-api-key header as a fallback", () => {
    expect(readApiKey(req({ "x-api-key": "zf_live_abc" }))).toBe("zf_live_abc");
  });
  it("returns null when neither is present", () => {
    expect(readApiKey(req({}))).toBeNull();
  });
});

describe("requireApiKey", () => {
  it("throws unauthenticated when the key doesn't verify", async () => {
    verifyApiKey.mockResolvedValue(null);
    await expect(requireApiKey(req({ authorization: "Bearer zf_live_bad" }), "shifts:read")).rejects.toMatchObject({
      status: 401,
    });
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("throws forbidden when the key lacks the scope, without consuming rate-limit budget", async () => {
    verifyApiKey.mockResolvedValue({ id: "k1", scopes: ["timesheets:read"], tenantId: null });
    await expect(requireApiKey(req({ authorization: "Bearer zf_live_ok" }), "shifts:read")).rejects.toMatchObject({
      status: 403,
    });
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(resolveTenantPlan).not.toHaveBeenCalled();
  });

  it("a platform-wide key (no tenantId) uses the fixed 120/min limit, no plan lookup", async () => {
    verifyApiKey.mockResolvedValue({ id: "k2", scopes: ["*"], tenantId: null });
    enforceRateLimit.mockResolvedValue(RATE_OK);
    const result = await requireApiKey(req({ authorization: "Bearer zf_live_admin" }), "webhooks:manage");
    expect(result.key.id).toBe("k2");
    expect(resolveTenantPlan).not.toHaveBeenCalled();
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "api-key", identifier: "k2", limit: 120 }));
  });

  it("a tenant-scoped key uses its plan's rate limit, not the platform default", async () => {
    verifyApiKey.mockResolvedValue({ id: "k1", scopes: ["shifts:read"], tenantId: "t1" });
    resolveTenantPlan.mockResolvedValue({ key: "starter", label: "Starter", rateLimitPerMinute: 300, monthlyRequestCap: 100_000, scopes: ["shifts:read"] });
    enforceRateLimit.mockResolvedValue(RATE_OK);

    const result = await requireApiKey(req({ authorization: "Bearer zf_live_ok" }), "shifts:read");

    expect(result.key.id).toBe("k1");
    expect(resolveTenantPlan).toHaveBeenCalledWith("t1");
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "api-key", identifier: "k1", limit: 300 }));
  });

  it("also checks the monthly cap for a plan that has one", async () => {
    verifyApiKey.mockResolvedValue({ id: "k1", scopes: ["shifts:read"], tenantId: "t1" });
    resolveTenantPlan.mockResolvedValue({ key: "free", label: "Free", rateLimitPerMinute: 60, monthlyRequestCap: 10_000, scopes: ["shifts:read"] });
    enforceRateLimit.mockResolvedValue(RATE_OK);

    await requireApiKey(req({ authorization: "Bearer zf_live_ok" }), "shifts:read");

    expect(enforceRateLimit).toHaveBeenCalledTimes(2);
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "api-key-month", limit: 10_000, identifier: expect.stringContaining("k1:") }),
    );
  });

  it("skips the monthly check entirely for an uncapped plan (scale)", async () => {
    verifyApiKey.mockResolvedValue({ id: "k1", scopes: ["shifts:read"], tenantId: "t1" });
    resolveTenantPlan.mockResolvedValue({ key: "scale", label: "Scale", rateLimitPerMinute: 1200, monthlyRequestCap: null, scopes: ["shifts:read"] });
    enforceRateLimit.mockResolvedValue(RATE_OK);

    await requireApiKey(req({ authorization: "Bearer zf_live_ok" }), "shifts:read");

    expect(enforceRateLimit).toHaveBeenCalledTimes(1);
  });

  it("propagates the underlying 429 when the per-minute rate limit is already exhausted", async () => {
    verifyApiKey.mockResolvedValue({ id: "k1", scopes: ["shifts:read"], tenantId: null });
    enforceRateLimit.mockRejectedValue(AppError.rateLimited("Too many requests", 30, 120));
    await expect(requireApiKey(req({ authorization: "Bearer zf_live_ok" }), "shifts:read")).rejects.toMatchObject({
      status: 429,
    });
  });

  it("propagates a 429 from the monthly cap check too", async () => {
    verifyApiKey.mockResolvedValue({ id: "k1", scopes: ["shifts:read"], tenantId: "t1" });
    resolveTenantPlan.mockResolvedValue({ key: "free", label: "Free", rateLimitPerMinute: 60, monthlyRequestCap: 10_000, scopes: ["shifts:read"] });
    enforceRateLimit.mockResolvedValueOnce(RATE_OK).mockRejectedValueOnce(AppError.rateLimited("Monthly cap reached", 60, 10_000));

    await expect(requireApiKey(req({ authorization: "Bearer zf_live_ok" }), "shifts:read")).rejects.toMatchObject({
      status: 429,
    });
  });
});
