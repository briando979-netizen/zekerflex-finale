import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize, relative, sep } from "node:path";

// ---------------------------------------------------------------------------
// Chat attachments — voice notes, photos, documents. Stored per thread on the
// box's own disk (no S3, no Upload table):
//   storage/chat/media/<threadId>/<mediaId>          — the bytes
//   storage/chat/media/<threadId>/<mediaId>.meta.json — filename + mime + size
// Access control is done by the caller (must be a thread participant).
// ---------------------------------------------------------------------------

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME = [
  /^image\//,
  /^audio\//,
  /^video\/(mp4|webm|quicktime)$/,
  /^application\/pdf$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-excel|vnd\.oasis\.opendocument\.)/,
  /^text\/(plain|csv)$/,
];

export interface StoredChatMedia {
  mediaId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

function mediaDir(threadId: string): string {
  return join(process.cwd(), "storage", "chat", "media", threadId.replace(/[^a-z0-9-]/gi, ""));
}
function safeMediaId(id: string): string {
  return id.replace(/[^a-z0-9-]/gi, "");
}
function jailed(threadId: string, name: string): string {
  const dir = mediaDir(threadId);
  const abs = normalize(join(dir, name));
  const rel = relative(dir, abs);
  if (rel.startsWith("..") || rel.startsWith(sep)) throw new Error("path escape");
  return abs;
}

export function isAllowedChatMime(mime: string): boolean {
  return ALLOWED_MIME.some((re) => re.test(mime));
}

export async function storeChatMedia(
  threadId: string,
  input: { filename: string; mimeType: string; bytes: Buffer; durationSec?: number },
): Promise<StoredChatMedia & { durationSec?: number }> {
  if (input.bytes.length === 0) throw new Error("leeg bestand");
  if (input.bytes.length > MAX_BYTES) throw new Error(`bestand te groot (max ${MAX_BYTES / 1024 / 1024} MB)`);
  const mime = input.mimeType || "application/octet-stream";
  if (!isAllowedChatMime(mime)) throw new Error("bestandstype niet toegestaan");

  const mediaId = randomUUID().slice(0, 16);
  const filename =
    input.filename.replace(/[^\w.\- ]+/g, "_").trim().slice(0, 160) || "bestand";
  await mkdir(mediaDir(threadId), { recursive: true });
  await writeFile(jailed(threadId, mediaId), input.bytes, { flag: "wx" });
  const meta: StoredChatMedia & { durationSec?: number } = {
    mediaId,
    filename,
    mimeType: mime,
    sizeBytes: input.bytes.length,
    ...(input.durationSec ? { durationSec: Math.round(input.durationSec) } : {}),
  };
  await writeFile(jailed(threadId, `${mediaId}.meta.json`), JSON.stringify(meta), "utf8");
  return meta;
}

export async function readChatMedia(
  threadId: string,
  mediaId: string,
): Promise<{ bytes: Buffer; filename: string; mimeType: string } | null> {
  const id = safeMediaId(mediaId);
  const bytesPath = jailed(threadId, id);
  const metaPath = jailed(threadId, `${id}.meta.json`);
  if (!existsSync(bytesPath) || !existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as StoredChatMedia;
    return { bytes: await readFile(bytesPath), filename: meta.filename, mimeType: meta.mimeType };
  } catch {
    return null;
  }
}
