import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Een afgebroken stroom (13 nov 2026, opdracht 86): de eigen Ollama stopt de runner bij geheugengebrek (OOM-kill, elke ochtend
// rond 06:00). Dan komt er een error-regel, eindigt de stroom zonder finish_reason of [DONE], of valt de verbinding weg.
// Vóór het eerste woord: één keer het reservemodel, anders een fout voor de terugval van de aanroeper. Al tekst verstuurd:
// geen herkansing, de tekst blijft, en daarna StroomAfgebroken, zodat het scherm kan zeggen dat het antwoord niet af is.

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

import { readFileSync } from "node:fs";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { AFGEBROKEN_ZIN, StroomAfgebroken, _resetLlmBreaker, chatStream, isStroomAfgebroken } from "@/lib/ai/client";

type Einde = "[DONE]" | "finish_reason" | "zomaar" | "error-regel" | "verbinding weg";
const regel = (tekst: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: tekst } }] })}\n`;

/** Een nagemaakte SSE-stroom: één stuk per leesbeurt, daarna het gekozen einde (een fout pas als alles gelezen is). */
function stroom(stukken: string[], einde: Einde): Response {
  const enc = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        const stuk = stukken[i++];
        if (stuk !== undefined) return c.enqueue(enc.encode(regel(stuk)));
        if (einde === "verbinding weg") return c.error(new TypeError("terminated"));
        if (einde === "[DONE]") c.enqueue(enc.encode("data: [DONE]\n"));
        if (einde === "finish_reason") c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n`));
        if (einde === "error-regel") c.enqueue(enc.encode(`data: ${JSON.stringify({ error: { message: "model runner has unexpectedly stopped" } })}\n`));
        c.close();
      },
    },
    { highWaterMark: 0 },
  );
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Alles wat de stroom gaf, en de fout aan het eind (null = netjes klaar). */
async function leesTot(gen: AsyncGenerator<string, unknown, void>): Promise<{ uit: string; fout: unknown }> {
  let uit = "";
  try {
    for await (const s of gen) uit += s;
    return { uit, fout: null };
  } catch (fout) {
    return { uit, fout };
  }
}

const vraag = () => chatStream({ messages: [{ role: "user", content: "hoi" }], purpose: "public-chat" });
const hosts = (f: { mock: { calls: unknown[][] } }) => f.mock.calls.map((c) => String(c[0]).split("/")[2]);
let warn: { mock: { calls: unknown[][] } } = { mock: { calls: [] } };
const afgebrokenMeldingen = () => warn.mock.calls.filter((c) => c[0] === "llm stream afgebroken");

beforeEach(() => {
  _resetLlmBreaker();
  warn = vi.spyOn(logger, "warn");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  _resetLlmBreaker();
});

describe("afgebroken vóór het eerste woord: één keer de reserve", () => {
  for (const einde of ["error-regel", "zomaar", "verbinding weg"] as const) {
    it(`${einde} → het reservemodel antwoordt, met een melding in het logboek`, async () => {
      const fetchMock = vi.fn(async (url: string) => (url.startsWith("http://ollama") ? stroom(["Hallo ", "van de reserve"], "[DONE]") : stroom([], einde)));
      vi.stubGlobal("fetch", fetchMock);
      const { uit, fout } = await leesTot(vraag());
      expect(fout).toBeNull();
      expect(uit).toBe("Hallo van de reserve");
      expect(hosts(fetchMock)).toEqual(["extern.example", "ollama:11434"]);
      expect(afgebrokenMeldingen()).toHaveLength(1);
      expect(afgebrokenMeldingen()[0]?.[1]).toMatchObject({ naEersteWoord: false, opReserve: false });
    });
  }

  it("ook de reserve breekt af → een fout voor de terugval van de aanroeper (geen StroomAfgebroken)", async () => {
    const fetchMock = vi.fn(async () => stroom([], "zomaar"));
    vi.stubGlobal("fetch", fetchMock);
    const { uit, fout } = await leesTot(vraag());
    expect(uit).toBe("");
    expect(fout).toBeInstanceOf(AppError);
    expect(isStroomAfgebroken(fout)).toBe(false);
    expect((fout as Error).message).toMatch(/afgebroken vóór het eerste woord/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("afgebroken nadat er al tekst ging: geen herkansing, wel de vlag", () => {
  for (const einde of ["error-regel", "zomaar", "verbinding weg"] as const) {
    it(`${einde} → de tekst blijft, daarna StroomAfgebroken`, async () => {
      const fetchMock = vi.fn(async () => stroom(["Het antwoord ", "is half"], einde));
      vi.stubGlobal("fetch", fetchMock);
      const { uit, fout } = await leesTot(vraag());
      expect(uit).toBe("Het antwoord is half");
      expect(isStroomAfgebroken(fout)).toBe(true);
      expect(fout).toBeInstanceOf(AppError);
      expect((fout as StroomAfgebroken).deelTekst).toBe("Het antwoord is half");
      expect((fout as StroomAfgebroken).afgebroken).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(afgebrokenMeldingen()[0]?.[1]).toMatchObject({ naEersteWoord: true });
    });
  }
});

describe("netjes klaar", () => {
  for (const einde of ["[DONE]", "finish_reason"] as const) {
    it(`alleen ${einde} is genoeg: gewoon het antwoord, geen melding`, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => stroom(["Alles ", "is goed."], einde)));
      const { uit, fout } = await leesTot(vraag());
      expect(fout).toBeNull();
      expect(uit).toBe("Alles is goed.");
      expect(afgebrokenMeldingen()).toHaveLength(0);
    });
  }
});

describe("de chatschermen zeggen dat een afgebroken antwoord niet af is", () => {
  it("openbare chat en sitechat zetten AFGEBROKEN_ZIN achter de tekst, niet in het bewaarde antwoord", () => {
    for (const pad of ["app/api/chat/route.ts", "lib/sitechat/antwoord.ts"]) {
      const s = readFileSync(pad, "utf8").replace(/\r\n/g, "\n");
      expect(s, pad).toMatch(/\} else if \(isStroomAfgebroken\(err\)\) \{\n[^\n]*\n\s*controller\.enqueue\(enc\.encode\(AFGEBROKEN_ZIN\)\);/);
    }
    expect(AFGEBROKEN_ZIN).toMatch(/brak af/);
  });
});
