import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// De klik-om-af-te-spelen video toont eerst onze eigen kopie van het
// YouTube-plaatje: één keer opgehaald (alleen i.ytimg.com, alleen echte ids),
// daarna van schijf.

process.env.YOUTUBE_THUMB_DIR = mkdtempSync(join(tmpdir(), "zf-yt-"));
const importRemoteImage = vi.fn();
vi.mock("@/lib/media/clean-image", () => ({ importRemoteImage: (...a: unknown[]) => importRemoteImage(...a) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined, privateRateLimitIdentifier: (s: string) => s }));

// loaded after the folder above is set
let GET: typeof import("@/app/api/media/youtube/[id]/route").GET;
beforeAll(async () => {
  ({ GET } = await import("@/app/api/media/youtube/[id]/route"));
});
beforeEach(() => importRemoteImage.mockClear());

const call = (id: string) => GET(new Request(`https://zekerflex.com/api/media/youtube/${id}`), { params: Promise.resolve({ id }) });

describe("YouTube-voorbeeldplaatje", () => {
  it("haalt een echt id één keer op bij i.ytimg.com en bewaart het", async () => {
    importRemoteImage.mockResolvedValue({ bytes: Buffer.from("webp-bytes"), width: 480, height: 360, sourceUrl: "" });
    const first = await call("dQw4w9WgXcQ");
    expect(first.status).toBe(200);
    expect(first.headers.get("Content-Type")).toBe("image/webp");
    expect(importRemoteImage).toHaveBeenCalledWith("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    const second = await call("dQw4w9WgXcQ");
    expect(Buffer.from(await second.arrayBuffer()).toString()).toBe("webp-bytes");
    expect(importRemoteImage).toHaveBeenCalledTimes(1);
  });

  it("weigert alles wat geen YouTube-id is, zonder iets op te halen", async () => {
    for (const id of ["../etc/passwd", "kort", "dQw4w9WgXcQ%2F", "https:--evil"]) expect((await call(id)).status).toBe(404);
    expect(importRemoteImage).not.toHaveBeenCalled();
  });

  it("mislukt het verwerken, dan gewoon geen plaatje, en er wordt niets bewaard", async () => {
    // a broken result makes the write fail inside the route's own try/catch
    importRemoteImage.mockResolvedValue({ bytes: null, width: 0, height: 0, sourceUrl: "" });
    expect((await call("aaaaaaaaaaa")).status).toBe(404);
    expect(existsSync(join(process.env.YOUTUBE_THUMB_DIR!, "aaaaaaaaaaa.webp"))).toBe(false);
  });
});
