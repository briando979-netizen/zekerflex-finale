import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// stilBijFout (lib/ai/client.ts): de warm-cron meldt een mislukking zelf (niet tijdens een uitrol); dan geen
// "llm chat failed" op error-niveau in het foutenlogboek.

const log = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: (...a: unknown[]) => log.error(...a),
    warn: (...a: unknown[]) => log.warn(...a),
    info: (...a: unknown[]) => log.info(...a),
    debug: vi.fn(),
  },
}));
vi.mock("@/lib/ai/governor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/governor")>()),
  withGovernor: async (_p: string, fn: () => Promise<{ value: unknown }>) => (await fn()).value,
}));
vi.mock("@/lib/storage/kv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/kv")>()),
  kvGet: async () => null,
  kvSet: async () => undefined,
}));
vi.mock("@/lib/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...mod,
    env: {
      ...mod.env,
      LLM_BASE_URL: "http://ollama:11434/v1",
      LLM_MODEL: "gemma3:4b",
      LLM_FALLBACK_BASE_URL: "",
      LLM_FALLBACK_MODEL: "",
    },
  };
});

import { _resetLlmBreaker, chat } from "@/lib/ai/client";

beforeEach(() => {
  _resetLlmBreaker();
  log.error.mockReset();
  log.info.mockReset();
  // het eigen model staat stil (uitrol): elke aanvraag faalt zoals op prod ("fetch failed")
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new TypeError("fetch failed");
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  _resetLlmBreaker();
});

const errorMeldingen = () => log.error.mock.calls.filter((c) => c[0] === "llm chat failed").length;

describe("llm chat failed in het foutenlogboek", () => {
  it("een gewone aanroep meldt het onbereikbare model als fout", async () => {
    await expect(chat({ messages: [{ role: "user", content: "ok" }], retry: false })).rejects.toBeTruthy();
    expect(errorMeldingen()).toBe(1);
  });

  it("met stilBijFout: dezelfde fout naar de aanroeper, maar alleen een info-regel", async () => {
    await expect(chat({ purpose: "ai-warm", messages: [{ role: "user", content: "ok" }], retry: false, stilBijFout: true })).rejects.toBeTruthy();
    expect(errorMeldingen()).toBe(0);
    expect(log.info.mock.calls.some((c) => c[0] === "llm chat mislukt, de aanroeper meldt het zelf")).toBe(true);
  });
});
