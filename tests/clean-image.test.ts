import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

// Foto's van overal, getoond van onze eigen herkomst (img-src 'self' blijft
// streng): elke foto wordt rechtop gezet, ontdaan van EXIF/GPS, begrensd en
// als WebP bewaard. Een webpagina of SVG wordt nooit een "foto".

const fetchResource = vi.fn();
vi.mock("@/lib/website-check/fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/website-check/fetch")>()),
  fetchResource: (...a: unknown[]) => fetchResource(...a),
}));

import { FetchError } from "@/lib/website-check/fetch";
import { cleanImage, importRemoteImage } from "@/lib/media/clean-image";

async function jpegWithGps(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestCam", Copyright: "geheim" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 18/1 0/1" } })
    .toBuffer();
}

const res = (data: Buffer, type: string, status = 200) => ({ url: "x", finalUrl: "https://foto.example/a.jpg", status, headers: { "content-type": type }, data, transferBytes: data.length, bytes: data.length, ttfbMs: 1, totalMs: 1, redirects: [], truncated: false });

describe("foto's schoonmaken", () => {
  it("maakt een grote foto kleiner, WebP en zonder EXIF of GPS", async () => {
    const input = await jpegWithGps(3600, 2400);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await cleanImage(input);
    expect(out).toMatchObject({ width: 2400, height: 1600, mime: "image/webp" });
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
  });

  it("vergroot kleine foto's niet", async () => {
    const out = await cleanImage(await jpegWithGps(640, 480));
    expect(out).toMatchObject({ width: 640, height: 480 });
  });

  it("weigert SVG, tekst en lege bestanden", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    await expect(cleanImage(svg)).rejects.toThrow(/SVG/);
    await expect(cleanImage(Buffer.from("gewoon tekst, geen foto"))).rejects.toThrow(/geen foto/);
    await expect(cleanImage(Buffer.alloc(0))).rejects.toThrow(/leeg/);
  });
});

describe("foto van internet ophalen", () => {
  it("haalt een foto één keer op en maakt hem schoon", async () => {
    fetchResource.mockResolvedValueOnce(res(await jpegWithGps(1200, 800), "image/jpeg"));
    const out = await importRemoteImage("https://foto.example/a.jpg");
    expect(out).toMatchObject({ width: 1200, height: 800, mime: "image/webp", sourceUrl: "https://foto.example/a.jpg" });
    expect(fetchResource).toHaveBeenLastCalledWith("https://foto.example/a.jpg", { maxBytes: 15_000_000, timeoutMs: 15_000 });
  });

  it("legt uit wat er mis is bij een webpagina, een fout of een geblokkeerd adres", async () => {
    fetchResource.mockResolvedValueOnce(res(Buffer.from("<html></html>"), "text/html; charset=utf-8"));
    await expect(importRemoteImage("https://site.example/pagina")).rejects.toThrow(/webpagina, geen foto/);
    fetchResource.mockResolvedValueOnce(res(Buffer.alloc(0), "image/jpeg", 404));
    await expect(importRemoteImage("https://site.example/weg.jpg")).rejects.toThrow(/code 404/);
    fetchResource.mockRejectedValueOnce(new FetchError("Dit is geen openbaar internetadres.", "BLOCKED"));
    await expect(importRemoteImage("http://169.254.169.254/latest")).rejects.toMatchObject({ status: 422, message: "Dit is geen openbaar internetadres." });
  });
});
