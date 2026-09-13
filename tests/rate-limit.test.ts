import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRedis, store, expireCalls, mode } = vi.hoisted(() => {
  const s = new Map<string, number>();
  const calls: Array<[string, number]> = [];
  const m = { fail: false };
  return {
    store: s,
    expireCalls: calls,
    mode: m,
    mockRedis: {
      incr: async (k: string) => {
        if (m.fail) throw new Error("redis down");
        const n = (s.get(k) ?? 0) + 1;
        s.set(k, n);
        return n;
      },
      expire: async (k: string, ttl: number) => {
        calls.push([k, ttl]);
        return 1;
      },
    },
  };
});

vi.mock("@/lib/redis", () => ({ redis: mockRedis }));

import { fixedWindow, enforceRateLimit } from "@/lib/rate-limit";
import { AppError, toErrorBody } from "@/lib/errors";

afterEach(() => {
  store.clear();
  expireCalls.length = 0;
  mode.fail = false;
});

describe("fixedWindow", () => {
  it("allows requests up to the limit and blocks the next one", async () => {
    let last;
    for (let i = 0; i < 3; i += 1) last = await fixedWindow("k", 3, 60);
    expect(last!.ok).toBe(true);
    expect(last!.remaining).toBe(0);

    const over = await fixedWindow("k", 3, 60);
    expect(over.ok).toBe(false);
    expect(over.count).toBe(4);
    expect(over.retryAfterSeconds).toBe(60);
  });

  it("sets the TTL only on the first hit of the window", async () => {
    await fixedWindow("k", 5, 90);
    await fixedWindow("k", 5, 90);
    expect(expireCalls).toEqual([["k", 90]]);
  });

  it("fails open by default when Redis is unreachable", async () => {
    mode.fail = true;
    const res = await fixedWindow("k", 1, 60);
    expect(res.ok).toBe(true);
    expect(res.count).toBe(0);
    expect(res.remaining).toBe(1);
  });

  it("fails closed when failOpen is false", async () => {
    mode.fail = true;
    const res = await fixedWindow("k", 1, 60, { failOpen: false });
    expect(res.ok).toBe(false);
  });
});

describe("enforceRateLimit", () => {
  const spec = { name: "signup", identifier: "1.2.3.4", limit: 2, windowSeconds: 60 };

  it("returns the gate while under the limit", async () => {
    const r1 = await enforceRateLimit(spec);
    expect(r1.ok).toBe(true);
    await enforceRateLimit(spec);
  });

  it("throws AppError.rateLimited (429 + Retry-After) once exhausted", async () => {
    await enforceRateLimit(spec);
    await enforceRateLimit(spec);
    await expect(enforceRateLimit(spec)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });

    try {
      await enforceRateLimit(spec);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const { status, headers } = toErrorBody(err);
      expect(status).toBe(429);
      expect(headers?.["Retry-After"]).toBe("60");
    }
  });

  it("namespaces the redis key as rl:<name>:<identifier>", async () => {
    await enforceRateLimit(spec).catch(() => undefined);
    expect([...store.keys()]).toContain("rl:signup:1.2.3.4");
  });
});
