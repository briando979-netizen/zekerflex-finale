import { afterEach, describe, expect, it, vi } from "vitest";

// Spraakinvoer (lib/asr/transcribe.ts) gaat naar de eigen Whisper-server, met
// precies de bytes van de opname (niet het hele gedeelde geheugenblok van Node).
const env = vi.hoisted(() => ({ WHISPER_ENABLED: true, WHISPER_BASE_URL: "http://whisper:8000/v1/", WHISPER_MODEL: "Systran/faster-whisper-small", WHISPER_API_KEY: undefined as string | undefined, LLM_BASE_URL: "http://ollama:11434/v1" }));
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { transcribeAudio, transcribeWoorden, woordenUitAntwoord } from "@/lib/asr/transcribe";

afterEach(() => {
  vi.unstubAllGlobals();
  env.WHISPER_ENABLED = true;
});

describe("spraakinvoer naar Whisper", () => {
  it("stuurt de opname naar de eigen Whisper-server met het juiste model", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: " Goedemiddag. " }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    // een kleine Buffer is een stukje van een groter, gedeeld geheugenblok
    const opname = Buffer.from("RIFF1234");
    const uit = await transcribeAudio(opname, "zin.wav");
    expect(uit.text).toBe("Goedemiddag.");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://whisper:8000/v1/audio/transcriptions");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("Systran/faster-whisper-small");
    expect(form.get("language")).toBe("nl");
    expect((form.get("file") as Blob).size).toBe(opname.length);
  });

  it("zonder Whisper valt hij terug op de AI-node", async () => {
    env.WHISPER_ENABLED = false;
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: "x" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await transcribeAudio(Buffer.from("abc"), "zin.webm");
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe("http://ollama:11434/v1/audio/transcriptions");
  });

  it("een fout van de server is een nette melding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kapot", { status: 500 })));
    await expect(transcribeAudio(Buffer.from("abc"), "zin.wav")).rejects.toThrow("Spraakherkenning gaf een fout (500)");
  });
});

describe("woorden met hun tijd (ondertitels in de video-editor, 13 nov)", () => {
  it("leest de woorden soepel: spaties weg, een onbruikbaar woord valt weg, een einde vóór het begin wordt het begin", () => {
    const uit = woordenUitAntwoord({
      words: [
        { word: " Hallo", start: 0, end: 0.4, probability: 0.9 },
        { word: "", start: 1, end: 2 },
        { word: "x", start: "a", end: 1 },
        { word: " daar", start: 0.5, end: 0.3 },
        { word: "min", start: -1, end: 0 },
      ],
    });
    expect(uit).toEqual([
      { woord: "Hallo", start: 0, eind: 0.4 },
      { woord: "daar", start: 0.5, eind: 0.5 },
    ]);
  });

  it("zonder `words` uit de woorden per segment, op volgorde; iets anders dan een antwoord geeft niets", () => {
    const uit = woordenUitAntwoord({ segments: [{ words: [{ word: " een", start: 1, end: 1.2 }] }, { words: [{ word: " twee", start: 0.5, end: 0.8 }] }, null] });
    expect(uit.map((w) => w.woord)).toEqual(["twee", "een"]);
    expect(woordenUitAntwoord(null)).toEqual([]);
    expect(woordenUitAntwoord("tekst")).toEqual([]);
    expect(woordenUitAntwoord({ words: "geen lijst" })).toEqual([]);
  });

  it("vraagt de eigen Whisper om woordtijden (verbose_json) en stuurt het bestand zoals het is", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: " Hallo daar. ", words: [{ word: " Hallo", start: 0.1, end: 0.5 }, { word: " daar.", start: 0.6, end: 1 }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const bestand = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "video/mp4" });
    const uit = await transcribeWoorden(bestand, "vabc.mp4", { language: "en", prompt: "ZekerFlex" });
    expect(uit.text).toBe("Hallo daar.");
    expect(uit.woorden).toEqual([
      { woord: "Hallo", start: 0.1, eind: 0.5 },
      { woord: "daar.", start: 0.6, eind: 1 },
    ]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://whisper:8000/v1/audio/transcriptions");
    const form = init.body as FormData;
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.getAll("timestamp_granularities[]")).toEqual(["word"]);
    expect(form.get("language")).toBe("en");
    expect(form.get("prompt")).toBe("ZekerFlex");
    expect((form.get("file") as Blob).size).toBe(5);
  });

  it("zonder eigen Whisper: de gewone omzetting, zonder woordtijden", async () => {
    env.WHISPER_ENABLED = false;
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: "alleen tekst" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const uit = await transcribeWoorden(new Blob([new Uint8Array([1, 2])]), "c.wav");
    expect(uit).toMatchObject({ text: "alleen tekst", woorden: [] });
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe("http://ollama:11434/v1/audio/transcriptions");
  });

  it("een fout van Whisper is een nette melding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kapot", { status: 500 })));
    await expect(transcribeWoorden(new Blob([new Uint8Array([1])]), "c.mp4")).rejects.toThrow("Spraakherkenning gaf een fout (500)");
  });
});
