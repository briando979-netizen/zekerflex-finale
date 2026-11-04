import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { cleanImage } from "@/lib/media/clean-image";

// ---------------------------------------------------------------------------
// Media-bibliotheek van de Site-ontwerper: foto's en video's voor de eigen
// pagina's. In storage/ (een volume, dus een uitrol overleeft het), geserveerd
// vanaf onze eigen herkomst op /beeld/<id>. Foto's worden schoongemaakt (geen
// EXIF/GPS, rechtop, WebP, nooit SVG); video's alleen MP4 of WebM, herkend aan
// de eerste bytes en niet alleen aan wat de browser zegt.
// ---------------------------------------------------------------------------

export const MEDIA_DIR = process.env.ONTWERP_MEDIA_DIR || path.join(process.cwd(), "storage", "ontwerp-media");
const INDEX = "ontwerp:media";
export const MAX_FOTO_BYTES = 15_000_000;
export const MAX_VIDEO_BYTES = 80_000_000;
const MAX_ITEMS = 500;

export interface MediaItem {
  id: string;
  soort: "foto" | "video";
  naam: string;
  alt: string;
  mime: "image/webp" | "video/mp4" | "video/webm";
  bytes: number;
  breedte: number | null;
  hoogte: number | null;
  op: string;
}

const isId = (id: string) => /^m[a-z0-9]{10,30}$/.test(id);
const nieuwId = () => `m${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
const bestand = (id: string, variant: "groot" | "klein" | "video", ext: string) => path.join(MEDIA_DIR, `${id}${variant === "klein" ? "-klein" : ""}.${ext}`);

export async function mediaLijst(): Promise<MediaItem[]> {
  return (await kvGet<MediaItem[]>(INDEX).catch(() => null)) ?? [];
}

async function bewaarIndex(items: MediaItem[]) {
  await kvSet(INDEX, items.slice(0, MAX_ITEMS));
}

export async function mediaItem(id: string): Promise<MediaItem | null> {
  if (!isId(id)) return null;
  return (await mediaLijst()).find((m) => m.id === id) ?? null;
}

const schoneNaam = (n: string) => n.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 80) || "Zonder naam";

/** MP4 (…ftyp op plek 4) of WebM (1A 45 DF A3); al het andere niet. */
export function videoSoort(buf: Buffer): "video/mp4" | "video/webm" | null {
  if (buf.length >= 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") return "video/mp4";
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "video/webm";
  return null;
}

export async function uploadMedia(data: Buffer, naam: string): Promise<MediaItem> {
  if (!data.length) throw AppError.validation("Dit bestand is leeg.");
  await mkdir(MEDIA_DIR, { recursive: true });
  const id = nieuwId();
  const video = videoSoort(data);
  let item: MediaItem;
  if (video) {
    if (data.length > MAX_VIDEO_BYTES) throw AppError.validation("Deze video is groter dan 80 MB. Maak hem korter of kleiner.");
    await writeFile(bestand(id, "video", video === "video/mp4" ? "mp4" : "webm"), data);
    item = { id, soort: "video", naam: schoneNaam(naam), alt: "", mime: video, bytes: data.length, breedte: null, hoogte: null, op: new Date().toISOString() };
  } else {
    if (data.length > MAX_FOTO_BYTES) throw AppError.validation("Deze foto is groter dan 15 MB.");
    const groot = await cleanImage(data, 2400);
    const klein = await sharp(groot.bytes).resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    await writeFile(bestand(id, "groot", "webp"), groot.bytes);
    await writeFile(bestand(id, "klein", "webp"), klein);
    item = { id, soort: "foto", naam: schoneNaam(naam), alt: "", mime: "image/webp", bytes: groot.bytes.length, breedte: groot.width, hoogte: groot.height, op: new Date().toISOString() };
  }
  await bewaarIndex([item, ...(await mediaLijst())]);
  return item;
}

export async function zetAlt(id: string, alt: string, naam?: string): Promise<MediaItem | null> {
  const items = await mediaLijst();
  const i = items.findIndex((m) => m.id === id);
  const oud = items[i];
  if (!oud) return null;
  const nieuw: MediaItem = { ...oud, alt: alt.trim().slice(0, 200), ...(naam !== undefined ? { naam: schoneNaam(naam) } : {}) };
  items[i] = nieuw;
  await bewaarIndex(items);
  return nieuw;
}

export async function verwijderMedia(id: string): Promise<void> {
  const items = await mediaLijst();
  const item = items.find((m) => m.id === id);
  if (!item) return;
  const paden = item.soort === "video" ? [bestand(id, "video", item.mime === "video/mp4" ? "mp4" : "webm")] : [bestand(id, "groot", "webp"), bestand(id, "klein", "webp")];
  await Promise.all(paden.map((p) => unlink(p).catch(() => undefined)));
  await bewaarIndex(items.filter((m) => m.id !== id));
}

/** De bytes van een foto (groot of klein) of video. */
export async function leesMedia(item: MediaItem, klein: boolean): Promise<Buffer> {
  if (item.soort === "video") return readFile(bestand(item.id, "video", item.mime === "video/mp4" ? "mp4" : "webm"));
  return readFile(bestand(item.id, klein ? "klein" : "groot", "webp"));
}
