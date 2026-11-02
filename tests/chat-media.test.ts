import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Chatbijlagen horen bij het gesprek waarin ze zijn geüpload. Upload-ids zijn
// gedeeld met ID-foto's en facturen; zonder die koppeling kon iedere deelnemer
// van een chat elk bestand opvragen. Foto's verliezen hun locatiegegevens.

const kv = vi.hoisted(() => new Map<string, unknown>());
const uploads = vi.hoisted(() => new Map<string, { filename: string; mimeType: string; bytes: Buffer }>());
const messages = vi.hoisted(() => new Map<string, { attachment?: { mediaId: string } }[]>());

vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => kv.get(k) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v) }));
vi.mock("@/lib/storage/local", () => ({
  storeUpload: async (u: { filename: string; mimeType: string; bytes: Buffer }) => {
    const id = `upl_${uploads.size + 1}`;
    uploads.set(id, u);
    return { id, filename: u.filename, mimeType: u.mimeType, sizeBytes: u.bytes.length };
  },
  readUpload: async (id: string) => {
    const u = uploads.get(id);
    if (!u) throw new Error("niet gevonden");
    return u;
  },
}));
vi.mock("@/lib/messaging/store", () => ({ getMessages: async (threadId: string) => messages.get(threadId) ?? [] }));

import { cleanPhoto, isAllowedChatMime, opensInline, ownChatUpload, PHOTO_MAX_PX, readChatMedia, storeChatMedia } from "@/lib/messaging/media";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

beforeEach(() => {
  kv.clear();
  uploads.clear();
  messages.clear();
});

const jpegWithGps = () =>
  sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#4a8" } })
    .jpeg()
    .withExif({ IFD0: { Make: "Testtoestel" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 22/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "4/1 53/1 0/1" } })
    .toBuffer();

describe("chatbijlagen", () => {
  it("weigert SVG (kan script bevatten) en laat gewone foto's, spraak en pdf toe", () => {
    expect(isAllowedChatMime("image/svg+xml")).toBe(false);
    expect(isAllowedChatMime("text/html")).toBe(false);
    for (const ok of ["image/jpeg", "image/png", "image/heic", "audio/webm;codecs=opus", "application/pdf"]) expect(isAllowedChatMime(ok)).toBe(true);
  });

  it("haalt de locatie uit een foto en maakt hem niet groter dan nodig", async () => {
    const original = await jpegWithGps();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const cleaned = (await cleanPhoto(original, "image/jpeg"))!;
    const meta = await sharp(cleaned).metadata();
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(PHOTO_MAX_PX);
    expect(await cleanPhoto(Buffer.from("geen foto"), "image/jpeg")).toBeNull();
    expect(await cleanPhoto(original, "application/pdf")).toBeNull();
  });

  it("slaat foto's schoon op en koppelt elke upload aan gesprek en uploader", async () => {
    const stored = await storeChatMedia("t1", "u1", { filename: "foto.jpg", mimeType: "image/jpeg", bytes: await jpegWithGps() });
    expect((await sharp(uploads.get(stored.mediaId)!.bytes).metadata()).exif).toBeUndefined();
    expect(await ownChatUpload(stored.mediaId, "t1", "u1")).toMatchObject({ mediaId: stored.mediaId, mimeType: "image/jpeg" });
    expect(await ownChatUpload(stored.mediaId, "t2", "u1")).toBeNull(); // ander gesprek
    expect(await ownChatUpload(stored.mediaId, "t1", "u2")).toBeNull(); // andere gebruiker
    expect(await ownChatUpload("upl_van_een_id_foto", "t1", "u1")).toBeNull(); // upload van elders
    await expect(storeChatMedia("t1", "u1", { filename: "x.svg", mimeType: "image/svg+xml", bytes: Buffer.from("<svg/>") })).rejects.toThrow(/niet toegestaan/);
  });

  it("geeft een bestand alleen via een gesprek waarin het getoond wordt", async () => {
    const stored = await storeChatMedia("t1", "u1", { filename: "a.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4") });
    uploads.set("upl_kyc", { filename: "id-voorkant.jpg", mimeType: "image/jpeg", bytes: Buffer.from("id") });

    // de afzender ziet zijn upload meteen, vóór het bericht is opgeslagen; de ander nog niet
    expect(await readChatMedia("t1", stored.mediaId, "u1")).not.toBeNull();
    expect(await readChatMedia("t1", stored.mediaId, "u2")).toBeNull();

    messages.set("t1", [{ attachment: { mediaId: stored.mediaId } }]);
    expect(await readChatMedia("t1", stored.mediaId, "u2")).toMatchObject({ filename: "a.pdf" });
    expect(await readChatMedia("t9", stored.mediaId, "u2")).toBeNull(); // via een ander gesprek: nee

    // een ID-foto (upload van elders) is via geen enkel gesprek op te vragen
    expect(await readChatMedia("t1", "upl_kyc", "u1")).toBeNull();

    // verwijderd voor iedereen: het bericht verliest zijn bijlage, dus het bestand is weg
    messages.set("t1", [{}]);
    expect(await readChatMedia("t1", stored.mediaId, "u2")).toBeNull();
  });

  it("een los geopende bijlage draait in een sandbox zonder script, de chat zelf niet", () => {
    const csp = buildContentSecurityPolicy({ dev: false, nonce: "n", pathname: "/api/inbox/thr_1/media/upl_1" });
    expect(csp).toMatch(/^sandbox;/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("script-src");
    // het uploadadres en de chatpagina houden het gewone beleid
    expect(buildContentSecurityPolicy({ dev: false, nonce: "n", pathname: "/api/inbox/thr_1/media" })).not.toContain("sandbox");
    expect(buildContentSecurityPolicy({ dev: false, nonce: "n", pathname: "/dashboard/berichten" })).not.toContain("sandbox");
  });

  it("toont alleen veilige soorten los in de browser", () => {
    for (const ok of ["image/jpeg", "image/png", "audio/webm", "video/mp4", "text/plain"]) expect(opensInline(ok)).toBe(true);
    for (const no of ["image/svg+xml", "text/html", "text/csv", "application/pdf", "application/msword", "application/octet-stream"]) expect(opensInline(no)).toBe(false);
  });
});
