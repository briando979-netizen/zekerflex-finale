import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AiUsageLog (13 nov 2026): lib/ai/client.ts geeft withGovernor het echte doel mee (model en host), ook bij "alles gratis",
// het reservemodel en embeddings. Daarvoor stond bij elke rij de host uit de omgeving (Google), ook bij ons eigen model, en
// telde Beheer -> Kosten die rijen als Gemini-verbruik.

const h = vi.hoisted(() => ({ doelen: [] as unknown[], gebruik: [] as unknown[] }));

vi.mock("@/lib/ai/governor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/governor")>()),
  withGovernor: async (_p: string, fn: () => Promise<{ value: unknown; usage: unknown }>, doel: unknown) => {
    h.doelen.push(doel);
    const out = await fn();
    h.gebruik.push(out.usage);
    return out.value;
  },
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
      LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
      LLM_MODEL: "gemini-x",
      LLM_API_KEY: "sleutel",
      AI_ALLOW_REMOTE: true,
      LLM_FALLBACK_BASE_URL: "http://reserve:11434/v1",
      LLM_FALLBACK_MODEL: "qwen2.5:3b",
      LLM_EMBED_BASE_URL: "http://ollama:11434/v1",
      LLM_EMBED_MODEL: "granite-embedding:278m",
    },
  };
});

import { _resetLlmBreaker, chat, embed } from "@/lib/ai/client";
import { setGratisStand } from "@/lib/ai/gratis";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const okChat = (model: string) => json({ model, choices: [{ message: { content: "hoi" } }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } });
const vraag = { messages: [{ role: "user" as const, content: "hoi" }], retry: false };

beforeEach(() => {
  _resetLlmBreaker();
  h.doelen.length = 0;
  h.gebruik.length = 0;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  _resetLlmBreaker();
  await setGratisStand({ aan: false });
});

describe("het doel dat in AiUsageLog komt", () => {
  it("Gemini: het gevraagde model en de host van Google (zonder pad of sleutel)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okChat("gemini-x")));
    await chat(vraag);
    expect(h.doelen).toEqual([{ model: "gemini-x", host: "generativelanguage.googleapis.com" }]);
    expect(h.gebruik[0]).toMatchObject({ model: "gemini-x", host: "generativelanguage.googleapis.com", totalTokens: 5 });
  });

  it("'alles gratis': ons eigen model en onze eigen server, niet de host uit de omgeving", async () => {
    await setGratisStand({ aan: true, model: "gemma3:4b" });
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return okChat("gemma3:4b");
    }));
    await chat({ ...vraag, purpose: "kyc-review" });
    expect(urls[0]).toBe("http://ollama:11434/v1/chat/completions");
    expect(h.doelen).toEqual([{ model: "gemma3:4b", host: "ollama" }]);
    expect(h.gebruik[0]).toMatchObject({ model: "gemma3:4b", host: "ollama" });
  });

  it("'alles gratis' en een time-out: het doel (dat bij een fout in het log komt) is ons eigen model, niet Gemini", async () => {
    await setGratisStand({ aan: true, model: "gemma3:4b" });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }));
    await expect(chat({ ...vraag, purpose: "kyc-review", timeoutMs: 8_000 })).rejects.toThrow(/timed out/);
    expect(h.doelen).toEqual([{ model: "gemma3:4b", host: "ollama" }]);
    expect(h.gebruik).toEqual([]);
  });

  it("het reservemodel antwoordt: diens model en host", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("https://generativelanguage") ? new Response("quota", { status: 429 }) : okChat("qwen2.5:3b"))));
    await chat(vraag);
    expect(h.doelen).toEqual([{ model: "gemini-x", host: "generativelanguage.googleapis.com" }]);
    expect(h.gebruik[0]).toMatchObject({ model: "qwen2.5:3b", host: "reserve" });
  });

  it("embeddings: het embedmodel en de server waar het draait (LLM_EMBED_BASE_URL)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ embedding: [0.1, 0.2] }], usage: { total_tokens: 4 } })));
    expect(await embed("hallo")).toEqual([[0.1, 0.2]]);
    expect(h.doelen).toEqual([{ model: "granite-embedding:278m", host: "ollama" }]);
    expect(h.gebruik[0]).toMatchObject({ model: "granite-embedding:278m", host: "ollama", totalTokens: 4 });
  });
});
