import { afterEach, describe, expect, it, vi } from "vitest";

// editImage draait door de render-wrapper (redis-lock) en praat met de A1111
// img2img-API. We mocken redis + fetch en forceren de beeldgenerator "aan".
const redis = { incr: vi.fn(async () => 1), expire: vi.fn(async () => 1), decr: vi.fn(async () => 0) };
vi.mock("@/lib/redis", () => ({ redis }));

process.env.IMAGE_ENABLED = "true";
process.env.IMAGE_BACKEND = "a1111";
process.env.IMAGE_BASE_URL = "http://127.0.0.1:7860";

async function load() {
  return (await import("@/lib/ai/images")).editImage;
}

afterEach(() => vi.unstubAllGlobals());

describe("editImage (img2img, self-hosted)", () => {
  it("stuurt init_images + prompt naar /sdapi/v1/img2img en geeft de bewerkte afbeelding terug", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        ({ ok: true, status: 200, json: async () => ({ images: ["ZWRpdGVk"], info: JSON.stringify({ seed: 42 }) }) }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const editImage = await load();
    const out = await editImage({
      imageB64: "data:image/png;base64,QUJD",
      prompt: "maak de achtergrond wit",
      width: 512,
      height: 512,
      denoise: 0.5,
    });

    expect(out.b64).toBe("ZWRpdGVk");
    expect(out.backend).toBe("a1111");
    expect(out.seed).toBe(42);

    const call = fetchMock.mock.calls[0]!;
    expect(String(call[0])).toContain("/sdapi/v1/img2img");
    const body = JSON.parse(String(call[1]?.body)) as { init_images: string[]; prompt: string; denoising_strength: number };
    expect(body.init_images[0]).toBe("QUJD"); // data:-prefix gestript
    expect(body.prompt).toBe("maak de achtergrond wit");
    expect(body.denoising_strength).toBe(0.5);
  });
});
