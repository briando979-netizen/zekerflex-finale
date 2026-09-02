import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize, relative, sep } from "node:path";

// ---------------------------------------------------------------------------
// Profile & organisation images (avatars, company photos). On the box's disk:
//   storage/profile/media/<id>            — the bytes
//   storage/profile/media/<id>.meta.json  — mime + filename
// Served to any signed-in user (photos are public within the platform).
// ---------------------------------------------------------------------------

const MAX_BYTES = 8 * 1024 * 1024;

function dir(): string {
  return join(process.cwd(), "storage", "profile", "media");
}
function jailed(name: string): string {
  const abs = normalize(join(dir(), name));
  const rel = relative(dir(), abs);
  if (rel.startsWith("..") || rel.startsWith(sep)) throw new Error("path escape");
  return abs;
}

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
  const id = randomUUID().slice(0, 16);
  await mkdir(dir(), { recursive: true });
  await writeFile(jailed(id), input.bytes, { flag: "wx" });
  await writeFile(
    jailed(`${id}.meta.json`),
    JSON.stringify({ mimeType: input.mimeType, filename: input.filename.slice(0, 120) }),
    "utf8",
  );
  return { id, mimeType: input.mimeType };
}

export async function readProfileImage(
  id: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const safe = id.replace(/[^a-z0-9-]/gi, "");
  if (!existsSync(jailed(safe)) || !existsSync(jailed(`${safe}.meta.json`))) return null;
  try {
    const meta = JSON.parse(await readFile(jailed(`${safe}.meta.json`), "utf8")) as { mimeType: string };
    return { bytes: await readFile(jailed(safe)), mimeType: meta.mimeType || "image/jpeg" };
  } catch {
    return null;
  }
}
