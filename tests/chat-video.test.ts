import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 2 (13 nov): video's spelen af in de bubbel. Safari (elke iPhone) speelt een <video> alleen af
// als de server stukken kan geven (Range → 206), dus de media-route kan dat nu ook. Kan een browser het formaat niet
// (HEVC uit een iPhone in Chrome), dan blijft de downloadkaart.

const bestand = { bytes: Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256)), filename: "klus.mp4", mimeType: "video/mp4" };
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "a", fullName: "A" }) }));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));
vi.mock("@/lib/messaging/store", () => ({ getThread: async () => ({ id: "t1", participants: ["a", "b"] }), canAccess: () => true, getMessages: async () => [], markeerEenmaligGezien: async () => "geen" }));
vi.mock("@/lib/messaging/media", () => ({
  readChatMedia: async () => bestand,
  opensInline: (m: string) => /^(?:image|audio|video)\//.test(m),
}));

import { leesBereik } from "@/lib/http/bereik";
import { isVideoType } from "@/lib/messaging/bijlage";
import { GET } from "@/app/api/inbox/[threadId]/media/[mediaId]/route";

const haal = (kop?: string, zoek = "") =>
  GET(new Request(`http://localhost/api/inbox/t1/media/m1${zoek}`, kop ? { headers: { range: kop } } : {}), { params: Promise.resolve({ threadId: "t1", mediaId: "m1" }) });

describe("leesBereik", () => {
  it("leest één bereik, ook open aan één kant, en houdt het binnen het bestand", () => {
    expect(leesBereik(null, 1000)).toBeNull();
    expect(leesBereik("bytes=0-99", 1000)).toEqual({ start: 0, eind: 99 });
    expect(leesBereik("bytes=500-", 1000)).toEqual({ start: 500, eind: 999 });
    expect(leesBereik("bytes=-100", 1000)).toEqual({ start: 900, eind: 999 });
    expect(leesBereik("bytes=0-5000", 1000)).toEqual({ start: 0, eind: 999 });
    expect(leesBereik("bytes=0-1", 1000)).toEqual({ start: 0, eind: 1 }); // Safari vraagt eerst twee bytes
  });

  it("buiten het bestand is ongeldig (416); een andere vorm geeft gewoon het hele bestand", () => {
    expect(leesBereik("bytes=1000-", 1000)).toBe("ongeldig");
    expect(leesBereik("bytes=-0", 1000)).toBe("ongeldig");
    expect(leesBereik("bytes=5-2", 1000)).toBe("ongeldig");
    expect(leesBereik("bytes=-", 1000)).toBe("ongeldig");
    expect(leesBereik("bytes=0-", 0)).toBe("ongeldig");
    expect(leesBereik("items=0-1", 1000)).toBeNull();
    expect(leesBereik("bytes=0-1,5-6", 1000)).toBeNull();
  });
});

describe("de media-route geeft stukken", () => {
  it("zonder Range het hele bestand, met Accept-Ranges", async () => {
    const res = await haal();
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it("met Range precies dat stuk (206) en de juiste Content-Range", async () => {
    const res = await haal("bytes=10-19");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 10-19/1000");
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...bestand.bytes.subarray(10, 20)]);
  });

  it("buiten het bestand 416, met de grootte", async () => {
    const res = await haal("bytes=2000-");
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */1000");
  });

  it("?klein=1 verandert niets aan een video", async () => {
    const res = await haal("bytes=0-1", "?klein=1");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-type")).toBe("video/mp4");
  });
});

describe("de bubbel en de kiezer", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

  it("isVideoType herkent video, geen foto's", () => {
    expect(isVideoType("video/mp4")).toBe(true);
    expect(isVideoType("video/quicktime")).toBe(true);
    expect(isVideoType("image/png")).toBe(false);
    expect(isVideoType("video/")).toBe(false);
  });

  it("de bubbel speelt een video af en valt terug op de downloadkaart; de galerij kiest ook video's", () => {
    const bubbel = lees("components/chat/MessageBubble.tsx");
    expect(bubbel).toContain('{m.kind === "file" && mediaUrl && isVideoType(m.attachment?.mimeType ?? "") && !videoKapot && (');
    expect(bubbel).toMatch(/<video\s+src=\{mediaUrl\}\s+controls\s+playsInline\s+preload="metadata"/);
    expect(bubbel).toContain("onError={() => setVideoKapot(true)}");
    expect(bubbel).toContain("<a href={`${mediaUrl}?dl=1`}"); // de downloadkaart blijft er altijd onder
    expect(lees("components/chat/Composer.tsx")).toContain('accept="image/*,video/*" hidden onChange={pick("image")}');
  });
});
