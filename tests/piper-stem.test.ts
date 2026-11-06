import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De eigen stem-server (Piper) en de keuze "eigen server of Google" in
// lib/ai/neural-tts.ts. Alles met een nagemaakte fetch: er gaat niets de deur
// uit en er is geen sleutel nodig.

const omgeving = vi.hoisted(() => ({ waarde: {} as Record<string, string | undefined> }));
vi.mock("@/lib/env", () => ({ env: omgeving.waarde }));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const opslag = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => opslag.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void opslag.set(k, v),
}));

import { setGratisStand } from "@/lib/ai/gratis";
import { piperAan, piperSpreek } from "@/lib/ai/piper";
import { neuralTtsEnabled, synthesizeSpeech, synthesizeSpeechMedia } from "@/lib/ai/neural-tts";

const BASIS = "http://piper:8000";
// Een ruwe MP3-frame en een WAV-kop: genoeg bytes om voor geluid door te gaan.
const MP3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x44]), Buffer.alloc(200, 1)]);
const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(200, 2)]);

function geluid(bytes: Buffer, mime = "application/octet-stream"): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": mime } });
}

function googleAntwoord(bytes: Buffer): Response {
  return new Response(JSON.stringify({ audioContent: bytes.toString("base64") }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function nepFetch(...antwoorden: Response[]) {
  const f = vi.fn();
  for (const a of antwoorden) f.mockResolvedValueOnce(a);
  // Elk onverwacht extra verzoek krijgt een eigen antwoord (een Response mag je
  // maar één keer uitlezen).
  f.mockImplementation(() => Promise.resolve(new Response("niet gevonden", { status: 404 })));
  vi.stubGlobal("fetch", f);
  return f;
}

/** Welke adressen er in welke volgorde zijn aangeroepen. */
function adressen(f: ReturnType<typeof vi.fn>): string[] {
  return f.mock.calls.map((c) => String(c[0]));
}

beforeEach(async () => {
  for (const k of Object.keys(omgeving.waarde)) delete omgeving.waarde[k];
  // De onthouden vorm van de stem-server staat op globalThis (Next bundelt per route).
  delete (globalThis as typeof globalThis & { __zfPiperVorm?: unknown }).__zfPiperVorm;
  opslag.clear();
  await setGratisStand({ aan: false, basis: "", model: "" });
});

afterEach(() => vi.unstubAllGlobals());

describe("eigen stem op onze server (Piper)", () => {
  it("doet niets zonder PIPER_URL: geen verzoek, geen fout", async () => {
    const f = nepFetch();
    expect(piperAan()).toBe(false);
    expect(await piperSpreek("Goedemiddag")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("vraagt de OpenAI-vorm met onze Nederlandse stem en krijgt MP3", async () => {
    omgeving.waarde.PIPER_URL = `${BASIS}/`;
    const f = nepFetch(geluid(MP3, "audio/mpeg"));
    const uit = await piperSpreek("Goedemiddag, u spreekt met ZekerFlex.");
    expect(uit?.mime).toBe("audio/mpeg");
    expect(uit?.audio.length).toBe(MP3.length);
    // het slotstreepje van PIPER_URL valt weg
    expect(adressen(f)).toEqual([`${BASIS}/v1/audio/speech`]);
    const body = JSON.parse(String(f.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "tts-1", voice: "alloy", response_format: "mp3" });
    expect(body.input).toBe("Goedemiddag, u spreekt met ZekerFlex.");
  });

  it("kent de dienst die vorm niet (404), dan volgt de eenvoudige Piper-server met WAV", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    const f = nepFetch(new Response("Not Found", { status: 404 }), geluid(WAV));
    const uit = await piperSpreek("Eén zin.");
    expect(uit?.mime).toBe("audio/wav");
    expect(adressen(f)).toEqual([`${BASIS}/v1/audio/speech`, `${BASIS}/`]);
    // de eenvoudige server krijgt gewoon de tekst, geen JSON
    expect(String(f.mock.calls[1]?.[1]?.body)).toBe("Eén zin.");
  });

  it("onthoudt welke vorm werkte, dus de tweede keer meteen goed", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    nepFetch(new Response("Not Found", { status: 404 }), geluid(WAV));
    await piperSpreek("Eerste keer.");
    vi.unstubAllGlobals();
    const f = nepFetch(geluid(WAV));
    expect((await piperSpreek("Tweede keer."))?.mime).toBe("audio/wav");
    expect(adressen(f)).toEqual([`${BASIS}/`]);
  });

  it("een adres met een eigen pad blijft heel: geen gezoek naar /v1", async () => {
    omgeving.waarde.PIPER_URL = `${BASIS}/v1/audio/speech`;
    const f = nepFetch(geluid(MP3));
    expect(await piperSpreek("Hallo")).not.toBeNull();
    expect(adressen(f)).toEqual([`${BASIS}/v1/audio/speech`]);
  });

  it("de bytes bepalen het mediatype, niet de kop van de dienst", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    nepFetch(geluid(WAV, "application/octet-stream"));
    expect((await piperSpreek("Hallo"))?.mime).toBe("audio/wav");
  });

  it("een antwoord zonder geluid (foutpagina met code 200) geeft null", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    const html = "<html><body>De stem-server is nog niet klaar met opstarten.</body></html>";
    const f = nepFetch(
      new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
      new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(await piperSpreek("Hallo")).toBeNull();
    expect(f).toHaveBeenCalledTimes(2); // beide vormen geprobeerd
  });

  it("een storing in de dienst (500) geeft null, zonder de hele vraag te herhalen", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    const f = nepFetch(new Response("kapot", { status: 500 }));
    expect(await piperSpreek("Hallo")).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("lege tekst gaat de deur niet uit", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    const f = nepFetch(geluid(MP3));
    expect(await piperSpreek("   ")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("stem kiezen: eigen server of Google", () => {
  it("staat er alleen een eigen stem-server, dan is voorlezen tóch mogelijk", () => {
    expect(neuralTtsEnabled()).toBe(false);
    omgeving.waarde.PIPER_URL = BASIS;
    expect(neuralTtsEnabled()).toBe(true);
  });

  it("zonder Google-sleutel gaat alles naar onze eigen server", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    const f = nepFetch(geluid(MP3, "audio/mpeg"));
    const uit = await synthesizeSpeechMedia("Goedemiddag");
    expect(uit?.bron).toBe("piper");
    expect(adressen(f).every((a) => a.startsWith(BASIS))).toBe(true);
  });

  it("zonder sleutel én zonder eigen server is er geen stem (browserstem blijft het laatste net)", async () => {
    const f = nepFetch();
    expect(await synthesizeSpeechMedia("Goedemiddag")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("met een Google-sleutel en 'alles gratis' uit gaat Google voor", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    omgeving.waarde.GOOGLE_TTS_API_KEY = "test-sleutel";
    const f = nepFetch(googleAntwoord(MP3));
    const uit = await synthesizeSpeechMedia("Goedemiddag");
    expect(uit?.bron).toBe("google");
    expect(uit?.mime).toBe("audio/mpeg");
    expect(adressen(f)).toHaveLength(1);
    expect(adressen(f)[0]).toContain("texttospeech.googleapis.com");
  });

  it("met 'alles gratis' aan gaat de eigen server voor, ook al staat de sleutel er", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    omgeving.waarde.GOOGLE_TTS_API_KEY = "test-sleutel";
    await setGratisStand({ aan: true });
    const f = nepFetch(geluid(MP3, "audio/mpeg"));
    const uit = await synthesizeSpeechMedia("Goedemiddag");
    expect(uit?.bron).toBe("piper");
    expect(adressen(f).some((a) => a.includes("googleapis.com"))).toBe(false);
  });

  it("mislukt Google (tegoed op), dan valt hij terug op onze eigen stem", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    omgeving.waarde.GOOGLE_TTS_API_KEY = "test-sleutel";
    const f = nepFetch(new Response("quota", { status: 429 }), geluid(MP3, "audio/mpeg"));
    const uit = await synthesizeSpeechMedia("Goedemiddag");
    expect(uit?.bron).toBe("piper");
    expect(adressen(f)[0]).toContain("texttospeech.googleapis.com");
    expect(adressen(f)[1]).toBe(`${BASIS}/v1/audio/speech`);
  });

  it("mislukt onze eigen stem met 'alles gratis' aan, dan doet Google het alsnog", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    omgeving.waarde.GOOGLE_TTS_API_KEY = "test-sleutel";
    await setGratisStand({ aan: true });
    const f = nepFetch(
      new Response("kapot", { status: 500 }),
      googleAntwoord(MP3),
    );
    const uit = await synthesizeSpeechMedia("Goedemiddag");
    expect(uit?.bron).toBe("google");
    expect(adressen(f)[1]).toContain("texttospeech.googleapis.com");
  });

  it("lukt geen van beide, dan is er geen geluid (en geen fout)", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    omgeving.waarde.GOOGLE_TTS_API_KEY = "test-sleutel";
    nepFetch(new Response("quota", { status: 429 }), new Response("kapot", { status: 500 }));
    expect(await synthesizeSpeechMedia("Goedemiddag")).toBeNull();
  });

  it("de oude aanroep blijft gewoon de bytes teruggeven", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    nepFetch(geluid(MP3, "audio/mpeg"));
    const bytes = await synthesizeSpeech("Goedemiddag");
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes?.length).toBe(MP3.length);
  });

  it("een lege tekst kost geen enkel verzoek", async () => {
    omgeving.waarde.PIPER_URL = BASIS;
    omgeving.waarde.GOOGLE_TTS_API_KEY = "test-sleutel";
    const f = nepFetch(geluid(MP3));
    expect(await synthesizeSpeech("  \n ")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
