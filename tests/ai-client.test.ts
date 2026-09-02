import { afterEach, describe, expect, it, vi } from "vitest";

// These tests exercise the HTTP client + retry logic only - bypass the
// governor (which would touch real Redis/Prisma and make the suite flaky).
vi.mock("@/lib/ai/governor", () => ({
  withGovernor: async <T>(_purpose: string, fn: () => Promise<{ value: T }>) =>
    (await fn()).value,
}));

import { chat, extractJson } from "@/lib/ai/client";

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl as never);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
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
