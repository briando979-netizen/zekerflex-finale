import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Een stream (assistent, Jarvis, sitechat) krijgt een eigen grens tot het eerste woord (12 nov 2026, opdracht 86): komt er
// niets, dan het reservemodel met dezelfde grens, en anders een fout voor de eigen terugval van de aanroeper. Is het eerste
// woord binnen, dan loopt de stream door met de ruime totaaltijd, ook als hij daarna traag is.

vi.mock("@/lib/ai/governor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/governor")>()),
  withGovernor: async (_p: string, fn: () => Promise<{ value: unknown }>) => (await fn()).value,
  isLocalInference: () => false,
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
      LLM_TIMEOUT_MS: 30_000,
    },
  };
});

import { _resetLlmBreaker, chatStream } from "@/lib/ai/client";

const regel = (tekst: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: tekst } }] })}\n`;

/** Een nagemaakte SSE-stream: elk stuk na de gegeven wachttijd (ms); luistert naar de afbreekknop zoals fetch doet. */
function stream(stukken: { na: number; tekst: string }[], signal?: AbortSignal | null): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(c) {
      try {
        for (const s of stukken) {
          await new Promise<void>((klaar, nee) => {
            const t = setTimeout(klaar, s.na);
            signal?.addEventListener("abort", () => {
              clearTimeout(t);
              nee(signal.reason);
            });
          });
          c.enqueue(enc.encode(regel(s.tekst)));
        }
        c.enqueue(enc.encode("data: [DONE]\n"));
        c.close();
      } catch (e) {
        c.error(e);
      }
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function lees(gen: AsyncGenerator<string, unknown, void>): Promise<string> {
  let uit = "";
  for await (const s of gen) uit += s;
  return uit;
}

beforeEach(() => _resetLlmBreaker());
afterEach(() => {
  vi.unstubAllGlobals();
  _resetLlmBreaker();
});

describe("stream: grens tot het eerste woord", () => {
  it("niets binnen de grens van het hoofdmodel → het reservemodel antwoordt", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.startsWith("http://ollama") ? stream([{ na: 5, tekst: "Hallo van de reserve" }], init?.signal) : stream([{ na: 5_000, tekst: "te laat" }], init?.signal),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tekst = await lees(chatStream({ messages: [{ role: "user", content: "hoi" }], purpose: "public-chat", eersteWoordMs: 80 }));
    expect(tekst).toBe("Hallo van de reserve");
    expect(fetchMock.mock.calls.map(([u]) => String(u).split("/")[2])).toEqual(["extern.example", "ollama:11434"]);
  });

  it("ook het reservemodel stil → een fout, zodat de aanroeper zijn eigen terugval geeft", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => stream([{ na: 5_000, tekst: "nooit" }], init?.signal)));
    await expect(lees(chatStream({ messages: [{ role: "user", content: "hoi" }], purpose: "public-chat", eersteWoordMs: 60 }))).rejects.toThrow(/geen eerste woord binnen 60ms/);
  });

  it("eerste woord op tijd en daarna traag → geen afbreking, het hele antwoord komt", async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) =>
      stream(
        [
          { na: 5, tekst: "Het " },
          { na: 150, tekst: "antwoord " },
          { na: 150, tekst: "komt rustig." },
        ],
        init?.signal,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tekst = await lees(chatStream({ messages: [{ role: "user", content: "hoi" }], purpose: "public-chat", eersteWoordMs: 80 }));
    expect(tekst).toBe("Het antwoord komt rustig.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
