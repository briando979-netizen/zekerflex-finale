import { afterEach, describe, expect, it, vi } from "vitest";

const verifyApiKey = vi.fn();
vi.mock("@/lib/integrations/api-keys", () => ({
  verifyApiKey: (...a: unknown[]) => verifyApiKey(...a),
  hasScope: (key: { scopes: string[] }, scope: string) => key.scopes.includes(scope),
}));

const enforceRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...a) }));

import { requireApiKey, readApiKey } from "@/lib/api-keys/gateway";
import { AppError } from "@/lib/errors";

afterEach(() => vi.clearAllMocks());

function req(headers: Record<string, string>): Request {
  return new Request("https://api.example/v1/shifts", { headers });
}

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
  });

  it("returns the key and the rate-limit gate on success", async () => {
    verifyApiKey.mockResolvedValue({ id: "k1", scopes: ["shifts:read"], tenantId: "t1" });
    enforceRateLimit.mockResolvedValue({ ok: true, count: 1, limit: 120, remaining: 119, retryAfterSeconds: 0, resetSeconds: 60 });

    const result = await requireApiKey(req({ authorization: "Bearer zf_live_ok" }), "shifts:read");

    expect(result.key.id).toBe("k1");
    expect(result.rate.remaining).toBe(119);
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "api-key", identifier: "k1", limit: 120 }));
  });

  it("a key with the wildcard scope passes any scope check", async () => {
    verifyApiKey.mockResolvedValue({ id: "k2", scopes: ["*"], tenantId: null });
    enforceRateLimit.mockResolvedValue({ ok: true, count: 1, limit: 120, remaining: 119, retryAfterSeconds: 0, resetSeconds: 60 });
    const result = await requireApiKey(req({ authorization: "Bearer zf_live_admin" }), "webhooks:manage");
    expect(result.key.id).toBe("k2");
  });

  it("propagates the underlying 429 when the rate limit is already exhausted", async () => {
    verifyApiKey.mockResolvedValue({ id: "k1", scopes: ["shifts:read"], tenantId: "t1" });
    enforceRateLimit.mockRejectedValue(AppError.rateLimited("Too many requests", 30, 120));
    await expect(requireApiKey(req({ authorization: "Bearer zf_live_ok" }), "shifts:read")).rejects.toMatchObject({
      status: 429,
    });
  });
});
