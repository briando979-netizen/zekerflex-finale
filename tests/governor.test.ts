import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Redis stand-in (hoisted so the vi.mock factories can use it).
const { mockStore, mockRedis, mockUsageCreate } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockStore: store,
    mockRedis: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => {
        store.set(k, v);
        return "OK";
      },
      incr: async (k: string) => {
        const n = Number(store.get(k) ?? 0) + 1;
        store.set(k, String(n));
        return n;
      },
      decr: async (k: string) => {
        const n = Number(store.get(k) ?? 0) - 1;
        store.set(k, String(n));
        return n;
      },
      incrby: async (k: string, by: number) => {
        const n = Number(store.get(k) ?? 0) + by;
        store.set(k, String(n));
        return n;
      },
      expire: async () => 1,
    },
    mockUsageCreate: vi.fn().mockResolvedValue({}),
  };
});

vi.mock("@/lib/redis", () => ({ redis: mockRedis }));
vi.mock("@/lib/prisma", () => ({
  prisma: { aiUsageLog: { create: mockUsageCreate } },
}));

import { budgetSnapshot, isLocalInference, withGovernor } from "@/lib/ai/governor";

beforeEach(() => {
  mockStore.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.clearAllMocks());

describe("isLocalInference", () => {
  it("recognises the default localhost base URL as local", () => {
    // tests/setup.ts leaves LLM_BASE_URL at its localhost default
    expect(isLocalInference()).toBe(true);
  });
});

describe("withGovernor", () => {
  it("runs the fn and bills its tokens against the daily budget", async () => {
    const out = await withGovernor("test", async () => ({
      value: "hello",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, model: "m" },
    }));
    expect(out).toBe("hello");
    expect(mockUsageCreate).toHaveBeenCalledOnce();

    const snap = await budgetSnapshot();
    expect(snap.tokensUsed).toBe(15);
    expect(snap.localInference).toBe(true);
  });

  it("hard-blocks once the daily token budget is exhausted", async () => {
    const day = new Date().toISOString().slice(0, 10);
    mockStore.set(`ai:gov:tokens:${day}`, String(999_999_999));
    await expect(
      withGovernor("test", async () => ({
        value: 1,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, model: "m" },
      })),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("still records usage when the fn throws", async () => {
    await expect(
      withGovernor("test", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(mockUsageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ok: false }) }),
    );
  });
});
