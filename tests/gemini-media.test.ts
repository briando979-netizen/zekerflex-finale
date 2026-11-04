import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Gemini-beeld en -stem: we mocken KV, de sleutel en fetch, en zetten de live AI
// "op Gemini", zoals op de VPS.
const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => kv.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => void kv.set(k, v)),
}));
vi.mock("@/lib/ai/llm-key", () => ({ getLlmApiKey: vi.fn(async () => "test-sleutel") }));
vi.mock("@/lib/redis", () => ({ redis: { incr: vi.fn(), expire: vi.fn(), decr: vi.fn() } }));

process.env.LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
process.env.AI_ALLOW_REMOTE = "true";
process.env.IMAGE_ENABLED = "false";

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function antwoord(status: number, body: unknown) {
  return { ok: status === 200, status, text: async () => JSON.stringify(body), json: async () => body } as unknown as Response;
}

beforeEach(() => kv.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Gemini-beeld (Nano Banana)", () => {
  it("zonder tegoed: nette melding over betalen en de blokkade wordt onthouden", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(429, { error: { code: 429, message: "You exceeded your current quota, please check your plan and billing details. FreeTier" } })));
    const { geminiBeeld, geminiSlot } = await import("@/lib/ai/gemini-media");
    await expect(geminiBeeld({ prompt: "een kok" })).rejects.toThrow(/betalen aan/);
    expect((await geminiSlot("beeld"))?.melding).toMatch(/gratis laag/);
  });

  it("met tegoed: stuurt model, verhouding en grootte en geeft de foto terug", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => antwoord(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1PX } }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { geminiBeeld, geminiSlot, geminiBeeldGelukt } = await import("@/lib/ai/gemini-media");
    const uit = await geminiBeeld({ prompt: "een kok", verhouding: "9:16", grootte: "4K", model: "gemini-3-pro-image" });
    expect(uit.b64).toBe(PNG_1PX);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("models/gemini-3-pro-image:generateContent");
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.responseModalities).toEqual(["IMAGE"]);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: "9:16", imageSize: "4K" });
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-sleutel");
    expect(await geminiSlot("beeld")).toBeNull();
    expect(await geminiBeeldGelukt()).toBeTruthy();
  });

  it("de Studio gebruikt Gemini vanzelf als er geen eigen beeldserver is", async () => {
    const { beeldBackend, verhoudingVoor } = await import("@/lib/ai/images");
    expect(await beeldBackend()).toBe("gemini");
    expect(verhoudingVoor(1080, 1920)).toBe("9:16");
    expect(verhoudingVoor(1920, 1080)).toBe("16:9");
    expect(verhoudingVoor(1216, 832)).toBe("3:2");
  });
});

describe("Gemini-stem", () => {
  it("probeert het volgende model als het dagtegoed op is en maakt er een WAV van", async () => {
    const pcm = Buffer.alloc(4800).toString("base64");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(antwoord(429, { error: { message: "quota" } }))
      .mockResolvedValueOnce(antwoord(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm } }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { geminiStem } = await import("@/lib/ai/gemini-media");
    const { wavDuur } = await import("@/lib/video/wav");
    const wav = await geminiStem("Hallo daar", "Kore");
    expect(wav?.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wavDuur(wav!)).toBeCloseTo(0.1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).not.toBe(String(fetchMock.mock.calls[0]![0]));
  });

  it("geen enkel model beschikbaar: null (de editor meldt het dan netjes)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(429, { error: { message: "quota" } })));
    const { geminiStem } = await import("@/lib/ai/gemini-media");
    expect(await geminiStem("Hallo", "Kore")).toBeNull();
  });
});

describe("Veo", () => {
  it("accepteert alleen echte bewerkingsnamen", async () => {
    const { isVeoOperatie } = await import("@/lib/ai/gemini-media");
    expect(isVeoOperatie("models/veo-3.1-generate-preview/operations/abc123")).toBe(true);
    expect(isVeoOperatie("https://kwaad.example/x")).toBe(false);
    expect(isVeoOperatie("models/x/operations/../../files")).toBe(false);
  });

  it("zonder Veo-model in de lijst: duidelijke melding, geen verzoek naar een niet-bestaand model", async () => {
    const fetchMock = vi.fn(async (_url: string) => antwoord(200, { models: [{ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { veoStart } = await import("@/lib/ai/gemini-media");
    await expect(veoStart("drone over een magazijn", "9:16")).rejects.toThrow(/Veo/);
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("predictLongRunning"))).toBe(true);
  });
});
