import { randomBytes } from "node:crypto";
import { createReadStream, openAsBlob } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { cleanImage } from "@/lib/media/clean-image";
import { wavDuur } from "@/lib/video/wav";

// ---------------------------------------------------------------------------
// Bestanden van de video-editor: foto's, video's en geluid (eigen uploads,
// AI-foto's, AI-stemmen, exports). Op het opslagvolume (storage/), zodat een
// uitrol ze niet wist, en alleen voor beheerders te openen via
// /api/admin/video/bestand/<id>. Soort herkend aan de eerste bytes, nooit
// alleen aan wat de browser zegt; foto's worden schoongemaakt (geen EXIF/GPS).
// ---------------------------------------------------------------------------

export const VIDEO_DIR = process.env.VIDEO_STUDIO_DIR || path.join(process.cwd(), "storage", "video-studio");
const INDEX = "video:bestanden";
export const MAX_BESTAND_BYTES = 200_000_000;
const MAX_FOTO_BYTES = 15_000_000;
const MAX_ITEMS = 1000;

export type BestandSoort = "foto" | "video" | "audio";
export type BestandHerkomst = "upload" | "ai-foto" | "ai-stem" | "ai-clip" | "export" | "opname" | "muziek";

export interface VideoBestand {
  id: string;
  soort: BestandSoort;
  naam: string;
  mime: string;
  ext: string;
  bytes: number;
  duur: number | null;
  breedte: number | null;
  hoogte: number | null;
  herkomst: BestandHerkomst;
  op: string;
}

export const isBestandId = (id: string) => /^v[a-z0-9]{10,30}$/.test(id);
const nieuwId = () => `v${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
const pad = (id: string, ext: string) => path.join(VIDEO_DIR, `${id}.${ext}`);
export const bestandAdres = (id: string) => `/api/admin/video/bestand/${id}`;

/** Herken het bestand aan de eerste bytes. `gemeld` (van de browser) beslist alleen tussen audio en video in dezelfde verpakking. */
export function herken(buf: Buffer, gemeld = ""): { soort: BestandSoort; mime: string; ext: string } | null {
  const ascii = (a: number, b: number) => buf.subarray(a, b).toString("latin1");
  const audioGemeld = gemeld.startsWith("audio/");
  if (buf.length >= 12 && ascii(4, 8) === "ftyp") {
    const merk = ascii(8, 12);
    if (/^M4A|^M4B/.test(merk) || audioGemeld) return { soort: "audio", mime: "audio/mp4", ext: "m4a" };
    if (/^(avif|avis|heic|heix|mif1|msf1)$/.test(merk)) return { soort: "foto", mime: "image/webp", ext: "webp" };
    if (merk === "qt  ") return { soort: "video", mime: "video/quicktime", ext: "mov" };
    return { soort: "video", mime: "video/mp4", ext: "mp4" };
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return audioGemeld ? { soort: "audio", mime: "audio/webm", ext: "webm" } : { soort: "video", mime: "video/webm", ext: "webm" };
  }
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { soort: "audio", mime: "audio/wav", ext: "wav" };
  if (buf.length >= 4 && ascii(0, 4) === "OggS") return { soort: "audio", mime: "audio/ogg", ext: "ogg" };
  if (buf.length >= 3 && ascii(0, 3) === "ID3") return { soort: "audio", mime: "audio/mpeg", ext: "mp3" };
  if (buf.length >= 2 && buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0) return { soort: "audio", mime: "audio/mpeg", ext: "mp3" };
  if (buf.length >= 4 && ascii(0, 4) === "fLaC") return { soort: "audio", mime: "audio/flac", ext: "flac" };
  // Foto's: JPEG, PNG, WebP, GIF (AVIF/HEIC hierboven bij ftyp).
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { soort: "foto", mime: "image/webp", ext: "webp" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { soort: "foto", mime: "image/webp", ext: "webp" };
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { soort: "foto", mime: "image/webp", ext: "webp" };
  if (buf.length >= 6 && /^GIF8[79]a/.test(ascii(0, 6))) return { soort: "foto", mime: "image/webp", ext: "webp" };
  return null;
}

export async function bestandenLijst(): Promise<VideoBestand[]> {
  return (await kvGet<VideoBestand[]>(INDEX).catch(() => null)) ?? [];
}

export async function bestandItem(id: string): Promise<VideoBestand | null> {
  if (!isBestandId(id)) return null;
  return (await bestandenLijst()).find((b) => b.id === id) ?? null;
}

const schoneNaam = (n: string) => n.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 80) || "Zonder naam";

/** Een bestand bewaren. AVIF/HEIC-foto's zijn ftyp-bestanden; die gaan als foto via `gemeld`. */
export async function bewaarBestand(data: Buffer, naam: string, opties: { gemeld?: string; herkomst?: BestandHerkomst; duur?: number | null } = {}): Promise<VideoBestand> {
  if (!data.length) throw AppError.validation("Dit bestand is leeg.");
  if (data.length > MAX_BESTAND_BYTES) throw AppError.validation("Dit bestand is groter dan 200 MB. Maak het korter of kleiner.");
  const gemeld = opties.gemeld ?? "";
  const fotoGemeld = /^image\/(avif|heic|heif)$/.test(gemeld);
  const soort = fotoGemeld ? { soort: "foto" as const, mime: "image/webp", ext: "webp" } : herken(data, gemeld);
  if (!soort) throw AppError.validation("Dit soort bestand kan de editor niet gebruiken. Kies een foto (JPG, PNG, WebP), video (MP4, WebM, MOV) of geluid (MP3, WAV, M4A, OGG).");
  await mkdir(VIDEO_DIR, { recursive: true });
  const id = nieuwId();
  let item: VideoBestand;
  const basis = { id, naam: schoneNaam(naam), herkomst: opties.herkomst ?? "upload", op: new Date().toISOString() };
  if (soort.soort === "foto") {
    if (data.length > MAX_FOTO_BYTES) throw AppError.validation("Deze foto is groter dan 15 MB.");
    const schoon = await cleanImage(data, 3840);
    await writeFile(pad(id, "webp"), schoon.bytes);
    item = { ...basis, soort: "foto", mime: "image/webp", ext: "webp", bytes: schoon.bytes.length, duur: null, breedte: schoon.width, hoogte: schoon.height };
  } else {
    await writeFile(pad(id, soort.ext), data);
    const duur = opties.duur ?? (soort.ext === "wav" ? wavDuur(data) : null);
    item = { ...basis, soort: soort.soort, mime: soort.mime, ext: soort.ext, bytes: data.length, duur, breedte: null, hoogte: null };
  }
  const lijst = await bestandenLijst();
  const weg = lijst.slice(MAX_ITEMS - 1);
  await kvSet(INDEX, [item, ...lijst].slice(0, MAX_ITEMS));
  // Wat uit de lijst valt, ook van schijf halen.
  await Promise.all(weg.map((b) => unlink(pad(b.id, b.ext)).catch(() => undefined)));
  return item;
}

export async function zetBestandInfo(id: string, info: { naam?: string; duur?: number; breedte?: number; hoogte?: number }): Promise<VideoBestand | null> {
  const lijst = await bestandenLijst();
  const i = lijst.findIndex((b) => b.id === id);
  const oud = lijst[i];
  if (!oud) return null;
  const nieuw: VideoBestand = {
    ...oud,
    ...(info.naam !== undefined ? { naam: schoneNaam(info.naam) } : {}),
    ...(info.duur !== undefined && Number.isFinite(info.duur) ? { duur: Math.max(0, Math.min(36000, info.duur)) } : {}),
    ...(info.breedte !== undefined ? { breedte: Math.round(info.breedte) } : {}),
    ...(info.hoogte !== undefined ? { hoogte: Math.round(info.hoogte) } : {}),
  };
  lijst[i] = nieuw;
  await kvSet(INDEX, lijst);
  return nieuw;
}

export async function verwijderBestand(id: string): Promise<void> {
  const lijst = await bestandenLijst();
  const item = lijst.find((b) => b.id === id);
  if (!item) return;
  await unlink(pad(id, item.ext)).catch(() => undefined);
  await kvSet(INDEX, lijst.filter((b) => b.id !== id));
}

/** Het bestand als Blob, zonder het in het geheugen te laden (voor de spraakherkenning van de ondertitels). */
export async function bestandBlob(item: VideoBestand): Promise<Blob> {
  // openAsBlob geeft de Blob van node:buffer; fetch en FormData nemen die gewoon aan
  return (await openAsBlob(pad(item.id, item.ext), { type: item.mime })) as unknown as Blob;
}

/** Een Response met het bestand, met Range-ondersteuning (terugspoelen, Safari). */
export async function bestandAntwoord(item: VideoBestand, range: string | null): Promise<Response> {
  const bestand = pad(item.id, item.ext);
  let grootte: number;
  try {
    grootte = (await stat(bestand)).size;
  } catch {
    return new Response("Dit bestand bestaat niet (meer).", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const basis = {
    "Content-Type": item.mime,
    // Bestanden veranderen nooit (nieuw bestand = nieuw id), maar zijn privé.
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(range ?? "");
  let start = 0;
  let eind = grootte - 1;
  let status = 200;
  if (m) {
    const a = m[1] ? Number(m[1]) : NaN;
    const b = m[2] ? Number(m[2]) : NaN;
    if (Number.isNaN(a)) {
      start = Math.max(0, grootte - (Number.isNaN(b) ? grootte : b));
    } else {
      start = a;
      if (!Number.isNaN(b)) eind = Math.min(b, grootte - 1);
    }
    if (start >= grootte || start > eind) return new Response(null, { status: 416, headers: { ...basis, "Content-Range": `bytes */${grootte}` } });
    status = 206;
  }
  const stroom = Readable.toWeb(createReadStream(bestand, { start, end: eind })) as ReadableStream<Uint8Array>;
  return new Response(stroom, {
    status,
    headers: { ...basis, "Content-Length": String(eind - start + 1), ...(status === 206 ? { "Content-Range": `bytes ${start}-${eind}/${grootte}` } : {}) },
  });
}
