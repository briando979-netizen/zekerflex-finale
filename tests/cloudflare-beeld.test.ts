import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Gratis foto's via Cloudflare Workers AI, en de terugval als Google geen
// beeldtegoed geeft. KV, sleutel en fetch zijn nagebootst.
const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => kv.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => void kv.set(k, v)),
}));
vi.mock("@/lib/ai/llm-key", () => ({ getLlmApiKey: vi.fn(async () => "gemini-sleutel") }));
vi.mock("@/lib/redis", () => ({ redis: { incr: vi.fn(), expire: vi.fn(), decr: vi.fn() } }));

process.env.LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
process.env.AI_ALLOW_REMOTE = "true";
process.env.IMAGE_ENABLED = "false";
process.env.CLOUDFLARE_ACCOUNT_ID = "acc123";
process.env.CLOUDFLARE_AI_TOKEN = "cf-sleutel";

// Een echte, kleine JPEG (sharp moet hem kunnen lezen).
let JPEG_1PX = "";
beforeAll(async () => {
  const sharp = (await import("sharp")).default;
  JPEG_1PX = (await sharp({ create: { width: 4, height: 4, channels: 3, background: "#0e5c4a" } }).jpeg().toBuffer()).toString("base64");
});

function antwoord(status: number, body: unknown) {
  return { ok: status === 200, status, text: async () => JSON.stringify(body), json: async () => body } as unknown as Response;
}

beforeEach(() => kv.clear());
afterEach(() => vi.unstubAllGlobals());

describe("gratis AI-foto's via Cloudflare", () => {
  it("vraagt FLUX.1 schnell met de sleutel en geeft de foto terug", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => antwoord(200, { success: true, result: { image: JPEG_1PX } }));
    vi.stubGlobal("fetch", fetchMock);
    const { cloudflareBeeld } = await import("@/lib/ai/cloudflare-beeld");
    const uit = await cloudflareBeeld("een kok in een keuken", 7);
    expect(uit.b64).toBe(JPEG_1PX);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/black-forest-labs/flux-1-schnell");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer cf-sleutel");
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: "een kok in een keuken", steps: 4, seed: 7 });
  });

  it("dagtegoed op: nette melding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(429, { success: false, errors: [{ message: "daily free allocation exceeded" }] })));
    const { cloudflareBeeld } = await import("@/lib/ai/cloudflare-beeld");
    await expect(cloudflareBeeld("x")).rejects.toThrow(/dagtegoed van Cloudflare/);
  });

  it("Google zonder tegoed: de Studio valt terug op Cloudflare", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("generativelanguage")
        ? antwoord(429, { error: { message: "You exceeded your current quota, please check your plan and billing details. FreeTier" } })
        : antwoord(200, { success: true, result: { image: JPEG_1PX } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { beeldBackend, generateImage } = await import("@/lib/ai/images");
    expect(await beeldBackend()).toBe("gemini");
    const img = await generateImage({ prompt: "een kok", width: 1080, height: 1920 });
    expect(img.backend).toBe("cloudflare");
    expect(img.mimeType).toBe("image/png");
    // Daarna weet de app dat Google blokkeert en gaat hij meteen naar Cloudflare.
    expect(await beeldBackend()).toBe("cloudflare");
  });
});
