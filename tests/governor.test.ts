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

/** waar de aanroep heen gaat (lib/ai/client.ts geeft dit mee): ons eigen model, zoals bij "alles gratis" */
const DOEL = { model: "gemma3:4b", host: "ollama" };

/** de gegevens van de laatste rij in AiUsageLog */
const laatsteRij = () => (mockUsageCreate.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> } | undefined)?.data;

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
    }), DOEL);
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
      }), DOEL),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("still records usage when the fn throws", async () => {
    await expect(
      withGovernor("test", async () => {
        throw new Error("boom");
      }, DOEL),
    ).rejects.toThrow("boom");
    expect(mockUsageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ok: false }) }),
    );
  });
});

describe("AiUsageLog legt het echte doel vast (13 nov 2026)", () => {
  // daarvoor: de host uit de omgeving (LLM_BASE_URL) bij elke rij en het model uit de omgeving bij een fout, dus Google
  // en Gemini, ook als ons eigen model antwoordde (Beheer -> Kosten telde dat als Gemini-verbruik)
  it("een gelukte aanroep: het model uit het antwoord en de host van het doel", async () => {
    await withGovernor("test", async () => ({ value: 1, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, model: "gemma3:4b" } }), DOEL);
    expect(laatsteRij()).toMatchObject({ model: "gemma3:4b", endpointHost: "ollama", ok: true });
  });

  it("antwoordde een ander (het reservemodel), dan diens model en host", async () => {
    await withGovernor(
      "test",
      async () => ({ value: 1, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, model: "qwen2.5:3b", host: "reserve" } }),
      { model: "gemini-x", host: "generativelanguage.googleapis.com" },
    );
    expect(laatsteRij()).toMatchObject({ model: "qwen2.5:3b", endpointHost: "reserve" });
  });

  it("een mislukte aanroep: het gevraagde model en de host van het doel, niet die uit de omgeving", async () => {
    await expect(
      withGovernor("test", async () => {
        throw new Error("LLM request timed out after 8000ms");
      }, DOEL),
    ).rejects.toThrow("timed out");
    expect(laatsteRij()).toMatchObject({ model: "gemma3:4b", endpointHost: "ollama", ok: false });
  });
});
