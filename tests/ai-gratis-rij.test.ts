import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De gratis rij (lib/ai/ketting.ts, eigenaar 16 nov 2026: "als de ene tegen zijn limiet loopt, over naar de andere gratis
// die nog niet tegen zijn limiet zit"). Bij "alles gratis" eerst de gratis aanbieders met een sleutel; een 429 → meteen de
// volgende, en die volle slaan we daarna over; kan niemand, dan ons eigen model. Taken met persoonsgegevens blijven thuis.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage/kv")>()),
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
}));
vi.mock("@/lib/ai/governor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/governor")>()),
  withGovernor: async (_p: string, fn: () => Promise<{ value: unknown; usage: unknown }>) => {
    const r = await fn();
    gelogd.push(r.usage as { model: string; host: string });
    return r.value;
  },
}));
vi.mock("@/lib/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...mod,
    env: {
      ...mod.env,
      LLM_BASE_URL: "https://extern.example/v1",
      LLM_MODEL: "gemini-x",
      LLM_API_KEY: "hoofdsleutel",
      AI_ALLOW_REMOTE: true,
      LLM_EMBED_BASE_URL: "http://ollama:11434/v1",
      LLM_FALLBACK_BASE_URL: "http://ollama:11434/v1",
      LLM_FALLBACK_MODEL: "gemma3:4b",
      LLM_TIMEOUT_MS: 30_000,
      CLOUDFLARE_AI_TOKEN: undefined,
      CLOUDFLARE_ACCOUNT_ID: undefined,
    },
  };
});
vi.mock("@/lib/ai/ketting", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/ai/ketting")>();
  const dienst = (id: string) => ({ id, naam: id, basis: `https://${id}.example/v1`, accountNodig: false, waar: "test", aanmelden: `https://${id}.example`, limietTekst: "test", opmerking: "" });
  const model = (id: string, d: string, extra: Record<string, unknown> = {}, denkRuimte = 0) => ({ id, dienst: d, model: `${id}-model`, json: true, stream: true, limiet: {}, extra, denkRuimte });
  return {
    ...mod,
    KETTING_DIENSTEN: [dienst("een"), dienst("twee")],
    // twee modellen van dienst "een": elk een eigen limiet, dezelfde sleutel
    KETTING_AANBIEDERS: [model("een-a", "een", { reasoning_effort: "low" }, 100), model("twee-a", "twee"), model("een-b", "een")],
  };
});

const gelogd: { model: string; host: string }[] = [];

import { _resetLlmBreaker, chat, chatStream } from "@/lib/ai/client";
import { _resetKetting, kettingOverzicht } from "@/lib/ai/ketting-stand";
import { bruikbaar, duurNaarMs, nieuweStand, uitkomstVan, volgendeUtcMiddernacht } from "@/lib/ai/ketting-limiet";
import { magViaKetting } from "@/lib/ai/ketting";
import { setGratisStand } from "@/lib/ai/gratis";

const okChat = (content: string, model: string) =>
  new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
const vol = (headers: Record<string, string> = {}, tekst = "Rate limit reached for requests") =>
  new Response(JSON.stringify({ error: { message: tekst } }), { status: 429, headers });
const sse = (tekst: string) =>
  new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: tekst } }] })}\n\ndata: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });

interface Aanroep {
  url: string;
  auth: string | undefined;
  body: Record<string, unknown>;
}
let aanroepen: Aanroep[] = [];
function nep(antwoord: (url: string, body: Record<string, unknown>) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    aanroepen.push({ url, auth: (init.headers as Record<string, string>).Authorization, body });
    return antwoord(url, body);
  }));
}

const vraag = { messages: [{ role: "user" as const, content: "hoi" }], purpose: "shift-writer", retry: false };

beforeEach(async () => {
  kv.clear();
  await setGratisStand({ aan: true, basis: "", model: "gemma3:4b" });
  kv.set("ai-node:ketting", { sleutels: { een: "sleutel-een", twee: "sleutel-twee" }, accounts: {}, uit: [] });
  _resetKetting();
  _resetLlmBreaker();
  aanroepen = [];
  gelogd.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("limieten lezen", () => {
  it("leest de duur uit een kop", () => {
    expect(duurNaarMs("30")).toBe(30_000);
    expect(duurNaarMs("2m59.56s")).toBe(179_560);
    expect(duurNaarMs("450ms")).toBe(450);
    expect(duurNaarMs("1h2m")).toBe(3_720_000);
    expect(duurNaarMs("morgen")).toBeNull();
    expect(duurNaarMs(null)).toBeNull();
  });

  it("weet wat een fout betekent", () => {
    const nu = Date.UTC(2026, 10, 16, 10, 0, 0);
    const kop = (h: Record<string, string>) => (n: string) => h[n] ?? null;
    expect(uitkomstVan(429, kop({ "retry-after": "20" }), "", nu)).toMatchObject({ soort: "vol", tot: nu + 20_000 });
    expect(uitkomstVan(429, kop({ "x-ratelimit-reset-requests": "2m", "x-ratelimit-reset-tokens": "7s" }), "", nu)).toMatchObject({ tot: nu + 120_000 });
    // een daglimiet zonder kop: dicht tot middernacht UTC
    expect(uitkomstVan(429, kop({}), "Rate limit reached: requests per day (RPD)", nu)).toMatchObject({ soort: "vol", tot: volgendeUtcMiddernacht(nu), reden: "daglimiet bereikt" });
    expect(uitkomstVan(401, kop({}), "", nu).soort).toBe("instelling");
    expect(uitkomstVan(404, kop({}), "", nu).soort).toBe("instelling");
    expect(uitkomstVan(503, kop({}), "", nu).soort).toBe("storing");
    expect(uitkomstVan(400, kop({}), "bad request", nu).soort).toBe("vraag");
    // te groot voor dit model (Groq noemt dat ook rate_limit_exceeded): alleen deze vraag, het model blijft in de rij
    expect(uitkomstVan(413, kop({}), '{"error":{"message":"Request too large","code":"rate_limit_exceeded"}}', nu).soort).toBe("vraag");
    // Retry-After als datum
    expect(uitkomstVan(429, kop({ "retry-after": new Date(nu + 45_000).toUTCString() }), "", nu)).toMatchObject({ soort: "vol", tot: nu + 45_000 });
    // Cloudflare: het dagtegoed is op (code 3036) → dicht tot middernacht UTC
    expect(uitkomstVan(429, kop({}), '{"errors":[{"code":3036,"message":"you have used up your daily free allocation of 10,000 neurons"}]}', nu)).toMatchObject({ tot: volgendeUtcMiddernacht(nu), reden: "daglimiet bereikt" });
    expect(uitkomstVan(403, kop({}), "", nu)).toMatchObject({ soort: "instelling", reden: "geen toegang met deze sleutel" });
    // een rare kop zet de rij nooit dagen dicht
    const lang = uitkomstVan(429, kop({ "retry-after": "999999" }), "", nu);
    expect(lang.soort === "vol" && lang.tot - nu).toBeLessThanOrEqual(26 * 3_600_000);
  });

  it("houdt onze eigen grens per minuut en per dag aan", () => {
    const nu = Date.UTC(2026, 10, 16, 10, 0, 0);
    const s = { ...nieuweStand("2026-11-16"), vandaag: 5, minuut: [nu - 1000, nu - 2000] };
    expect(bruikbaar(s, { perMinuut: 2 }, nu)).toBe(false);
    expect(bruikbaar(s, { perMinuut: 3 }, nu)).toBe(true);
    expect(bruikbaar(s, { perDag: 5 }, nu)).toBe(false);
    // de volgende dag begint opnieuw
    expect(bruikbaar(s, { perDag: 5 }, nu + 24 * 3_600_000)).toBe(true);
    // een minuut later telt de minuut niet meer
    expect(bruikbaar(s, { perMinuut: 2 }, nu + 61_000)).toBe(true);
  });

  it("houdt taken met persoonsgegevens en de warmhouder thuis", () => {
    for (const p of ["kyc-review", "phone-agent", "chat-assist", "ai-warm", "recruiter-draft"]) expect(magViaKetting(p)).toBe(false);
    expect(magViaKetting(undefined)).toBe(false);
    expect(magViaKetting("shift-writer")).toBe(true);
    expect(magViaKetting("public-chat")).toBe(true);
  });
});

describe("de rij bij alles gratis", () => {
  it("vraagt eerst de bovenste, met zijn eigen sleutel en zonder keep_alive", async () => {
    nep((url) => (url.startsWith("https://een.example") ? okChat("van een", "een-a-model") : okChat("thuis", "gemma3:4b")));
    const out = await chat(vraag);
    expect(out.text).toBe("van een");
    expect(aanroepen).toHaveLength(1);
    expect(aanroepen[0]!.url).toBe("https://een.example/v1/chat/completions");
    expect(aanroepen[0]!.auth).toBe("Bearer sleutel-een");
    expect(aanroepen[0]!.body.model).toBe("een-a-model");
    expect(aanroepen[0]!.body.reasoning_effort).toBe("low");
    expect(aanroepen[0]!.body).not.toHaveProperty("keep_alive");
    expect(gelogd[0]).toMatchObject({ host: "een.example", model: "een-a-model" });
  });

  it("gaat bij een 429 meteen naar de volgende, en slaat de volle daarna over", async () => {
    nep((url) => (url.startsWith("https://een.example") ? vol({ "retry-after": "60" }) : url.startsWith("https://twee.example") ? okChat("van twee", "twee-a-model") : okChat("thuis", "gemma3:4b")));
    expect((await chat(vraag)).text).toBe("van twee");
    expect(aanroepen.map((a) => new URL(a.url).host)).toEqual(["een.example", "twee.example"]);
    expect(aanroepen[1]!.auth).toBe("Bearer sleutel-twee");

    aanroepen = [];
    expect((await chat(vraag)).text).toBe("van twee");
    expect(aanroepen.map((a) => new URL(a.url).host)).toEqual(["twee.example"]);

    const stand = await kettingOverzicht();
    const een = stand.find((d) => String(d.id) === "een")?.modellen.find((m) => m.id === "een-a");
    expect(een).toMatchObject({ reden: "limiet bereikt", vandaag: 1, gelukt: 0 });
    expect(een?.volTot).not.toBeNull();
    expect(stand.find((d) => String(d.id) === "twee")?.modellen[0]).toMatchObject({ vandaag: 2, gelukt: 2, volTot: null });
    // de sleutel zelf komt nooit in het overzicht
    expect(JSON.stringify(stand)).not.toContain("sleutel-een");
  });

  it("antwoordt met ons eigen model als iedereen vol zit", async () => {
    nep((url) => (url.includes(".example/") && !url.startsWith("https://extern") ? vol() : okChat("thuis", "gemma3:4b")));
    const out = await chat(vraag);
    expect(out.text).toBe("thuis");
    const laatste = aanroepen[aanroepen.length - 1]!;
    expect(laatste.url).toBe("http://ollama:11434/v1/chat/completions");
    expect(gelogd[0]).toMatchObject({ host: "ollama" });
  });

  it("slaat een aanbieder over die niet bereikbaar is of een storing heeft", async () => {
    nep((url) => {
      if (url.startsWith("https://een.example")) throw new TypeError("fetch failed");
      if (url.startsWith("https://twee.example")) return new Response("storing", { status: 503 });
      return okChat("thuis", "gemma3:4b");
    });
    expect((await chat(vraag)).text).toBe("thuis");
    expect(aanroepen.map((a) => new URL(a.url).host)).toEqual(["een.example", "twee.example", "een.example", "ollama:11434"]);
    aanroepen = [];
    expect((await chat(vraag)).text).toBe("thuis");
    expect(aanroepen.map((a) => new URL(a.url).host)).toEqual(["ollama:11434"]);
  });

  it("een geweigerde vraag (400) laat de aanbieder staan voor de volgende vraag", async () => {
    let eerste = true;
    nep((url) => {
      if (url.startsWith("https://een.example")) {
        if (eerste) {
          eerste = false;
          return new Response("bad request", { status: 400 });
        }
        return okChat("van een", "een-a-model");
      }
      return okChat("van twee", "twee-a-model");
    });
    expect((await chat(vraag)).text).toBe("van twee");
    expect((await chat(vraag)).text).toBe("van een");
  });

  it("stuurt een taak met persoonsgegevens niet door de rij", async () => {
    nep(() => okChat("thuis", "gemma3:4b"));
    await chat({ ...vraag, purpose: "kyc-review" });
    expect(aanroepen.map((a) => new URL(a.url).host)).toEqual(["ollama:11434"]);
  });

  it("slaat een uitgezette aanbieder en een zonder sleutel over", async () => {
    kv.set("ai-node:ketting", { sleutels: { twee: "sleutel-twee" }, accounts: {}, uit: ["twee"] });
    _resetKetting();
    nep(() => okChat("thuis", "gemma3:4b"));
    await chat(vraag);
    expect(aanroepen.map((a) => new URL(a.url).host)).toEqual(["ollama:11434"]);
  });

  it("vraagt JSON op de manier die de aanbieder kent", async () => {
    nep(() => okChat('{"a":1}', "een-a-model"));
    await chat({ ...vraag, json: true });
    expect(aanroepen[0]!.body.response_format).toEqual({ type: "json_object" });
  });

  it("een vol model van een dienst laat het andere model van die dienst staan", async () => {
    nep((url, body) => {
      if (body.model === "een-a-model") return vol({ "retry-after": "60" });
      if (url.startsWith("https://twee.example")) return new Response("storing", { status: 503 });
      return okChat("van een-b", "een-b-model");
    });
    expect((await chat(vraag)).text).toBe("van een-b");
    expect(aanroepen[2]).toMatchObject({ url: "https://een.example/v1/chat/completions", auth: "Bearer sleutel-een" });
  });

  it("geeft een denkend model ruimte voor zijn denkwerk", async () => {
    nep(() => okChat("kort", "een-a-model"));
    await chat({ ...vraag, maxTokens: 50 });
    expect(aanroepen[0]!.body.max_tokens).toBe(150);
  });

  it("een leeg antwoord: deze vraag naar de volgende, het model blijft in de rij", async () => {
    let eerste = true;
    nep((url) => {
      if (url.startsWith("https://een.example") && eerste) {
        eerste = false;
        return okChat("", "een-a-model");
      }
      return url.startsWith("https://een.example") ? okChat("van een", "een-a-model") : okChat("van twee", "twee-a-model");
    });
    expect((await chat(vraag)).text).toBe("van twee");
    expect((await chat(vraag)).text).toBe("van een");
  });

  it("gebruikt de rij niet als alles gratis uit staat", async () => {
    await setGratisStand({ aan: false });
    nep(() => okChat("van gemini", "gemini-x"));
    expect((await chat(vraag)).text).toBe("van gemini");
    expect(aanroepen.map((a) => new URL(a.url).host)).toEqual(["extern.example"]);
  });
});

describe("de rij bij een stroom", () => {
  it("stroomt van de volgende als de bovenste vol zit", async () => {
    nep((url) => (url.startsWith("https://een.example") ? vol() : url.startsWith("https://twee.example") ? sse("hallo ") : sse("thuis ")));
    const g = chatStream(vraag);
    let tekst = "";
    let r = await g.next();
    while (!r.done) {
      tekst += r.value;
      r = await g.next();
    }
    expect(tekst).toBe("hallo ");
    expect(r.value.model).toBe("twee-a-model");
    expect(aanroepen.map((a) => new URL(a.url).host)).toEqual(["een.example", "twee.example"]);
    expect(aanroepen[1]!.body.stream).toBe(true);
    expect(aanroepen[1]!.body).not.toHaveProperty("keep_alive");
  });

  it("stroomt van ons eigen model als niemand kan", async () => {
    nep((url) => (url.includes("ollama") ? sse("thuis ") : vol()));
    const g = chatStream(vraag);
    let tekst = "";
    for (let r = await g.next(); !r.done; r = await g.next()) tekst += r.value;
    expect(tekst).toBe("thuis ");
    const laatste = aanroepen[aanroepen.length - 1]!;
    expect(laatste.url).toBe("http://ollama:11434/v1/chat/completions");
  });
});
