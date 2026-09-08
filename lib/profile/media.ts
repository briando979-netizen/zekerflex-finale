import { storeUpload, readUpload } from "@/lib/storage/local";

// ---------------------------------------------------------------------------
// Profile & organisation images (avatars, company photos). Bytes go through
// the shared Upload store (local disk or S3 per STORAGE_BACKEND) — was its
// own local-disk implementation, unreliable on Vercel's serverless functions.
// Served to any signed-in user (photos are public within the platform).
// ---------------------------------------------------------------------------

const MAX_BYTES = 8 * 1024 * 1024;

export async function storeProfileImage(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<{ id: string; mimeType: string }> {
  if (!/^image\/(jpe?g|png|webp|gif|avif)$/i.test(input.mimeType)) {
    throw new Error("Alleen JPG, PNG, WebP, GIF of AVIF");
  }
  if (input.bytes.length === 0) throw new Error("Leeg bestand");
  if (input.bytes.length > MAX_BYTES) throw new Error("Afbeelding te groot (max 8 MB)");
  const stored = await storeUpload({ filename: input.filename, mimeType: input.mimeType, bytes: input.bytes });
  return { id: stored.id, mimeType: stored.mimeType };
}

export async function readProfileImage(
  id: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  try {
    const file = await readUpload(id);
    return { bytes: file.bytes, mimeType: file.mimeType };
  } catch {
    return null;
  }
}
