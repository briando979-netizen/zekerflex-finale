import { storeUpload, readUpload } from "@/lib/storage/local";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Chat attachments — voice notes, photos, documents. Bytes go through the
// shared Upload store (local disk or S3 per STORAGE_BACKEND); the one extra
// field (voice-note duration) lives in the generic KeyValueStore. Was its own
// local-disk implementation, unreliable on Vercel's serverless functions.
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

export function isAllowedChatMime(mime: string): boolean {
  return ALLOWED_MIME.some((re) => re.test(mime));
}

const durationKey = (mediaId: string) => `chat-media-duration:${mediaId}`;

export async function storeChatMedia(
  _threadId: string,
  input: { filename: string; mimeType: string; bytes: Buffer; durationSec?: number },
): Promise<StoredChatMedia & { durationSec?: number }> {
  if (input.bytes.length === 0) throw new Error("leeg bestand");
  if (input.bytes.length > MAX_BYTES) throw new Error(`bestand te groot (max ${MAX_BYTES / 1024 / 1024} MB)`);
  const mime = input.mimeType || "application/octet-stream";
  if (!isAllowedChatMime(mime)) throw new Error("bestandstype niet toegestaan");

  const stored = await storeUpload({ filename: input.filename, mimeType: mime, bytes: input.bytes });
  if (input.durationSec) {
    await kvSet(durationKey(stored.id), Math.round(input.durationSec));
  }
  return {
    mediaId: stored.id,
    filename: stored.filename,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    ...(input.durationSec ? { durationSec: Math.round(input.durationSec) } : {}),
  };
}

export async function readChatMedia(
  _threadId: string,
  mediaId: string,
): Promise<{ bytes: Buffer; filename: string; mimeType: string } | null> {
  try {
    const file = await readUpload(mediaId);
    return { bytes: file.bytes, filename: file.filename, mimeType: file.mimeType };
  } catch {
    return null;
  }
}

export async function chatMediaDuration(mediaId: string): Promise<number | null> {
  return kvGet<number>(durationKey(mediaId));
}
