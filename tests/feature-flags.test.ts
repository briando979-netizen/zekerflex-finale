import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));

import { evaluate, featureEnabled, flagsFor, setFlag, _resetFlagCacheForTest, type FlagOverride } from "@/lib/flags";

const ov = (o: Partial<FlagOverride>): FlagOverride => ({ updatedAt: "t", updatedBy: "me", ...o });

afterEach(() => {
  for (const k of Object.keys(kv)) delete kv[k];
  _resetFlagCacheForTest();
});

describe("evaluate", () => {
  it("uses the code default when unconfigured", () => {
    expect(evaluate("brein-assistent", undefined, {})).toBe(true); // registry default true
    expect(evaluate("onbekend", undefined, {})).toBe(false);
  });

  it("master off/on wins over the default", () => {
    expect(evaluate("brein-assistent", ov({ enabled: false }), { userId: "u1" })).toBe(false);
    expect(evaluate("qr-betalen", ov({ enabled: true }), { userId: "u1" })).toBe(true);
  });

  it("allowlist (roles/userIds) grants access even while off", () => {
    expect(evaluate("x", ov({ enabled: false, userIds: ["u1"] }), { userId: "u1" })).toBe(true);
    expect(evaluate("x", ov({ enabled: false, roles: ["PLATFORM_ADMIN"] }), { userId: "u2", roles: ["PLATFORM_ADMIN"] })).toBe(true);
    expect(evaluate("x", ov({ enabled: false, roles: ["PLATFORM_ADMIN"] }), { userId: "u2", roles: ["FREELANCER"] })).toBe(false);
  });

  it("percentage rollout is deterministic per user and roughly matches the percentage", () => {
    const o = ov({ rolloutPct: 30 });
    const first = evaluate("exp", o, { userId: "user-123" });
    expect(evaluate("exp", o, { userId: "user-123" })).toBe(first); // stable
    let on = 0;
    for (let i = 0; i < 2000; i++) if (evaluate("exp", o, { userId: `u${i}` })) on++;
    expect(on / 2000).toBeGreaterThan(0.24);
    expect(on / 2000).toBeLessThan(0.36);
  });

  it("anonymous users are only in a rollout at 100%", () => {
    expect(evaluate("exp", ov({ rolloutPct: 50 }), {})).toBe(false);
    expect(evaluate("exp", ov({ rolloutPct: 100 }), {})).toBe(true);
  });
});

describe("store round-trip", () => {
  it("setFlag persists and featureEnabled reads it back", async () => {
    await setFlag("qr-betalen", { enabled: false }, "admin@zf");
    expect(await featureEnabled("qr-betalen", { userId: "u1" })).toBe(false);
  });

  it("flagsFor resolves every known + stored flag for a caller", async () => {
    await setFlag("nieuwe-functie", { rolloutPct: 100 }, "admin@zf");
    const map = await flagsFor({ userId: "u1" });
    expect(map["brein-assistent"]).toBe(true);
    expect(map["nieuwe-functie"]).toBe(true);
  });
});
