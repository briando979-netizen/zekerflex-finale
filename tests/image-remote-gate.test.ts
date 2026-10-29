import { describe, expect, it, vi } from "vitest";

// Borgt de soevereiniteitsgrendel: een niet-lokale beeldserver mag ALLEEN met
// de expliciete opt-in IMAGE_ALLOW_REMOTE. Zonder die vlag → harde weigering,
// zodat beeld nooit per ongeluk naar een vreemde cloud lekt.
vi.mock("@/lib/redis", () => ({ redis: { incr: vi.fn(async () => 1), expire: vi.fn(async () => 1), decr: vi.fn(async () => 0) } }));

process.env.IMAGE_ENABLED = "true";
process.env.IMAGE_BACKEND = "a1111";
process.env.IMAGE_BASE_URL = "https://img.example.com"; // niet-lokaal
// IMAGE_ALLOW_REMOTE bewust NIET gezet → default false

describe("beeld soevereiniteitsgrendel", () => {
  it("weigert een niet-lokale beeldserver zonder IMAGE_ALLOW_REMOTE", async () => {
    const { generateImage } = await import("@/lib/ai/images");
    await expect(generateImage({ prompt: "x", width: 512, height: 512 })).rejects.toThrow(/Soevereiniteitsgrendel/);
  });
});
