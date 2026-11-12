import { storeUpload, readUpload } from "@/lib/storage/local";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { getMessages } from "@/lib/messaging/store";
import { chatOpslagType } from "@/lib/messaging/bijlage";

// ---------------------------------------------------------------------------
// Chat attachments — voice notes, photos, documents. Bytes go through the
// shared Upload store (local disk or S3 per STORAGE_BACKEND); the one extra
// field (voice-note duration) lives in the generic KeyValueStore. Was its own
// local-disk implementation, unreliable on Vercel's serverless functions.
//
// An attachment belongs to the thread it was uploaded in. Only its uploader can
// attach it to a message there, and it can only be read through a thread whose
// messages show it (a forwarded photo still works, a deleted one no longer does).
// Upload ids are shared with ID photos and invoices, so without this binding any
// chat participant could fetch any upload by its id.
//   key "chat-media:<mediaId>"          → ChatMediaOwner
//   key "chat-media-duration:<mediaId>" → seconds of a voice note
// ---------------------------------------------------------------------------

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Elk bestandstype mag (12 nov 2026, eigenaar). Wat een browser kan uitvoeren (html, svg, script) wordt bewaard als
// gewoon bestand (chatOpslagType, lib/messaging/bijlage.ts); alleen opensInline() opent in de browser, de rest downloadt.

/** Photos are re-encoded at most this wide/high: plenty for a phone screen, a fraction of the bytes. */
export const PHOTO_MAX_PX = 2048;

export interface StoredChatMedia {
  mediaId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface ChatMediaOwner extends StoredChatMedia {
  threadId: string;
  by: string;
}

const ownerKey = (mediaId: string) => `chat-media:${mediaId}`;
const durationKey = (mediaId: string) => `chat-media-duration:${mediaId}`;

/**
 * A phone photo carries the GPS spot where it was taken; sending it in a chat
 * should not hand that to the other side. Re-encoding drops all metadata (after
 * turning the photo upright) and shrinks it. Formats sharp can't decode (HEIC)
 * or a broken file: null, the original is kept.
 */
export async function cleanPhoto(bytes: Buffer, mime: string): Promise<Buffer | null> {
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return null;
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(bytes, { failOn: "none" }).rotate().resize({ width: PHOTO_MAX_PX, height: PHOTO_MAX_PX, fit: "inside", withoutEnlargement: true });
    if (mime === "image/png") return await img.png({ compressionLevel: 9 }).toBuffer();
    if (mime === "image/webp") return await img.webp({ quality: 82 }).toBuffer();
    return await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch {
    return null;
  }
}

export async function storeChatMedia(
  threadId: string,
  uploaderId: string,
  input: { filename: string; mimeType: string; bytes: Buffer; durationSec?: number },
): Promise<StoredChatMedia & { durationSec?: number }> {
  if (input.bytes.length === 0) throw AppError.validation("leeg bestand");
  if (input.bytes.length > MAX_BYTES) throw AppError.validation(`bestand te groot (max ${MAX_BYTES / 1024 / 1024} MB)`);
  const mime = chatOpslagType(input.mimeType);

  const bytes = (await cleanPhoto(input.bytes, mime)) ?? input.bytes;
  const stored = await storeUpload({ filename: input.filename, mimeType: mime, bytes, uploadedById: uploaderId });
  const media: StoredChatMedia = { mediaId: stored.id, filename: stored.filename, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes };
  await kvSet(ownerKey(stored.id), { ...media, threadId, by: uploaderId } satisfies ChatMediaOwner);
  if (input.durationSec) {
    await kvSet(durationKey(stored.id), Math.round(input.durationSec));
  }
  return { ...media, ...(input.durationSec ? { durationSec: Math.round(input.durationSec) } : {}) };
}

/** The attachment as this user uploaded it in this thread; null for someone else's upload or an id from elsewhere. */
export async function ownChatUpload(mediaId: string, threadId: string, userId: string): Promise<StoredChatMedia | null> {
  const o = await kvGet<ChatMediaOwner>(ownerKey(mediaId));
  if (!o || o.threadId !== threadId || o.by !== userId) return null;
  return { mediaId: o.mediaId, filename: o.filename, mimeType: o.mimeType, sizeBytes: o.sizeBytes };
}

export async function readChatMedia(
  threadId: string,
  mediaId: string,
  viewerId: string,
): Promise<{ bytes: Buffer; filename: string; mimeType: string } | null> {
  const shown = (await getMessages(threadId, 5000)).some((m) => m.attachment?.mediaId === mediaId);
  // the sender sees the photo straight away, before the message itself is stored
  if (!shown && !(await ownChatUpload(mediaId, threadId, viewerId))) return null;
  try {
    const file = await readUpload(mediaId);
    return { bytes: file.bytes, filename: file.filename, mimeType: file.mimeType };
  } catch {
    return null;
  }
}

/**
 * Opened on its own (a new tab), only these may show in the browser; anything
 * else downloads. Not PDF: Chrome's PDF viewer refuses the sandboxed CSP that
 * chat media gets, and the chat downloads documents anyway.
 */
export function opensInline(mime: string): boolean {
  return /^(?:image\/(?:jpeg|png|gif|webp|avif|bmp|heic|heif)$|audio\/|video\/|text\/plain$)/.test(mime);
}

export async function chatMediaDuration(mediaId: string): Promise<number | null> {
  return kvGet<number>(durationKey(mediaId));
}
