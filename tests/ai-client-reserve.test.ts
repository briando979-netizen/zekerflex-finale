import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Reservemodel (lib/ai/client.ts): valt het hoofdmodel uit met 429/5xx of is het
// onbereikbaar, dan antwoordt LLM_FALLBACK_BASE_URL/LLM_FALLBACK_MODEL.

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
      LLM_BASE_URL: "https://extern.example/v1",
      LLM_MODEL: "gemini-x",
      LLM_API_KEY: "sleutel",
      AI_ALLOW_REMOTE: true,
      LLM_FALLBACK_BASE_URL: "http://ollama:11434/v1",
      LLM_FALLBACK_MODEL: "qwen2.5:3b",
    },
  };
});

import { _resetLlmBreaker, chat, fallbackTarget } from "@/lib/ai/client";

const okChat = (content: string, model = "qwen2.5:3b") =>
  new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => _resetLlmBreaker());
afterEach(() => {
  vi.unstubAllGlobals();
  _resetLlmBreaker();
});

describe("reservemodel", () => {
  it("kent de reserve uit de omgeving", () => {
    expect(fallbackTarget()).toEqual({ base: "http://ollama:11434/v1", model: "qwen2.5:3b" });
  });

  it("antwoordt met de reserve als het hoofdmodel 429 blijft geven", async () => {
    const calls: { url: string; body: Record<string, unknown>; auth: boolean }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url, body, auth: Boolean((init.headers as Record<string, string>).Authorization) });
      if (url.startsWith("https://extern.example")) return new Response("quota", { status: 429 });
      return okChat("hallo van de reserve");
    }));
    const out = await chat({ messages: [{ role: "user", content: "hoi" }], retry: false });
    expect(out.text).toBe("hallo van de reserve");
    expect(calls[0]?.url).toBe("https://extern.example/v1/chat/completions");
    expect(calls[0]?.auth).toBe(true);
    const laatste = calls[calls.length - 1]!;
    expect(laatste.url).toBe("http://ollama:11434/v1/chat/completions");
    expect(laatste.body.model).toBe("qwen2.5:3b");
    expect(laatste.auth).toBe(false); // geen Gemini-sleutel naar de eigen server
  });

  it("antwoordt met de reserve als het hoofdmodel onbereikbaar is", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("https://extern.example")) throw new TypeError("fetch failed");
      return okChat("reserve");
    }));
    const out = await chat({ messages: [{ role: "user", content: "hoi" }], retry: false });
    expect(out.text).toBe("reserve");
  });

  it("laat een echte fout (400) niet naar de reserve gaan", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://extern.example")) return new Response("bad request", { status: 400 });
      return okChat("reserve");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat({ messages: [{ role: "user", content: "hoi" }], retry: false })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith("https://extern.example"))).toBe(true);
  });
});
