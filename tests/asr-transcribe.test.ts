import { afterEach, describe, expect, it, vi } from "vitest";

// Spraakinvoer (lib/asr/transcribe.ts) gaat naar de eigen Whisper-server, met
// precies de bytes van de opname (niet het hele gedeelde geheugenblok van Node).
const env = vi.hoisted(() => ({ WHISPER_ENABLED: true, WHISPER_BASE_URL: "http://whisper:8000/v1/", WHISPER_MODEL: "Systran/faster-whisper-small", WHISPER_API_KEY: undefined as string | undefined, LLM_BASE_URL: "http://ollama:11434/v1" }));
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { transcribeAudio } from "@/lib/asr/transcribe";

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
