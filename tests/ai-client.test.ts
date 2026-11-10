import { afterEach, describe, expect, it, vi } from "vitest";

// These tests exercise the HTTP client + retry logic only - bypass the
// governor (which would touch real Redis/Prisma and make the suite flaky).
vi.mock("@/lib/ai/governor", () => ({
  withGovernor: async <T>(_purpose: string, fn: () => Promise<{ value: T }>) =>
    (await fn()).value,
  isLocalInference: () => true,
}));
// …and the KV reads behind the node key/model/registry: the first chat() would
// otherwise wait on a real Redis/database and time out where none answers.
vi.mock("@/lib/storage/kv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/kv")>()),
  kvGet: async () => null,
  kvSet: async () => undefined,
}));

import { _resetLlmBreaker, chat, chatJson, extractJson, gratisTimeout } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn as unknown as typeof fetch);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  _resetLlmBreaker();
});

const okChat = (content: string) =>
  new Response(
    JSON.stringify({ model: "llama3.1:8b", choices: [{ message: { content } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("ai chat client", () => {
  it("calls an OpenAI-compatible /chat/completions on the configured base URL", async () => {
    const fetchMock = mockFetch(() => okChat("hallo"));

    const res = await chat({ messages: [{ role: "user", content: "hi" }] });

    expect(res.text).toBe("hallo");
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("llama3.1:8b");
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("does not send an Authorization header when no LLM_API_KEY is set", async () => {
    const fetchMock = mockFetch(() => okChat("x"));
    await chat({ messages: [{ role: "user", content: "hi" }] });
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("maps an upstream error to a 503 AppError", async () => {
    mockFetch(() => new Response("model not found", { status: 404 }));
    await expect(
      chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("maps a network failure to a 503 AppError", async () => {
    mockFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("auto-retries a transient hiccup and then succeeds", async () => {
    let n = 0;
    const fetchMock = mockFetch(() => {
      n += 1;
      if (n < 3) {
        const e = new TypeError("fetch failed");
        throw e;
      }
      return okChat("hersteld");
    });
    const res = await chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.text).toBe("hersteld");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after the retry budget and throws 503", async () => {
    const fetchMock = mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(
      chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ status: 503 });
    // 1 initial + LLM_RETRY_MAX (3, from tests/setup.ts) retries
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("with retry:false, fails after exactly one attempt (no backoff wait)", async () => {
    const fetchMock = mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(
      chat({ messages: [{ role: "user", content: "hi" }], retry: false }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after the server proved unreachable, the next call fails fast (one attempt)", async () => {
    const fetchMock = mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ status: 503 });
    fetchMock.mockClear();
    await expect(chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // and it recovers as soon as the server answers again
    mockFetch(() => okChat("terug"));
    expect((await chat({ messages: [{ role: "user", content: "hi" }] })).text).toBe("terug");
  });
});

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences and preamble", () => {
    const reply = 'Sure!\n```json\n{"risk":"LOW"}\n```\n';
    expect(extractJson<{ risk: string }>(reply)).toEqual({ risk: "LOW" });
  });

  it("throws on a reply with no JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("chatJson met een afgekapt antwoord", () => {
  it("meldt in het log dat het antwoord is afgekapt, zonder de inhoud", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            model: "llama3.1:8b",
            choices: [{ message: { content: '{"summary":"geheim","findings":[{"title":"hal' }, finish_reason: "length" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      chatJson({ messages: [{ role: "user", content: "hi" }], purpose: "orchestration", maxTokens: 4000 }),
    ).rejects.toThrow(/onleesbare JSON/);
    const log = warn.mock.calls.find(([m]) => m === "llm json onleesbaar");
    expect(log?.[1]).toEqual({ purpose: "orchestration", finishReason: "length", tekens: 45, maxTokens: 4000 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("geheim");
    warn.mockRestore();
  });
});

describe("wachttijd met het eigen model (alles gratis)", () => {
  it("geeft taken op de achtergrond drie keer zo lang, hooguit 3 minuten", () => {
    expect(gratisTimeout(30_000, true)).toBe(90_000);
    expect(gratisTimeout(60_000, true)).toBe(180_000);
    expect(gratisTimeout(120_000, true)).toBe(180_000);
  });

  it("laat korte aanroepen waar iemand op wacht, en Gemini, zoals ze zijn", () => {
    expect(gratisTimeout(8_000, true)).toBe(8_000);
    expect(gratisTimeout(15_000, true)).toBe(15_000);
    expect(gratisTimeout(30_000, false)).toBe(30_000);
  });
});
