import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getObjectBytes, putObject } from "@/lib/storage/s3";

// ---------------------------------------------------------------------------
// Local storage remains the default; S3-compatible storage is selected with
// STORAGE_BACKEND=s3 for MinIO, AWS S3 or Cloudflare R2.
// ---------------------------------------------------------------------------

function uploadsRoot(): string {
  return resolve(process.cwd(), env.UPLOADS_DIR);
}

function safeName(name: string): string {
  return (
    name
      .replace(/[^\w.\- ]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) || "bestand"
  );
}

export interface StoredUpload {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}

export async function storeUpload(input: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  uploadedById?: string | null;
  jarvisTurnId?: string | null;
}): Promise<StoredUpload> {
  if (input.bytes.length === 0) throw AppError.validation("Leeg bestand");
  if (input.bytes.length > env.UPLOAD_MAX_BYTES) {
    throw AppError.validation(
      `Bestand te groot (max ${(env.UPLOAD_MAX_BYTES / 1_000_000).toFixed(0)} MB)`,
    );
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const filename = safeName(input.filename);
  const day = new Date().toISOString().slice(0, 10);
  const storageKey = `${day}/${randomUUID()}-${filename}`;
  if (env.STORAGE_BACKEND === "s3") {
    await putObject({
      key: storageKey,
      body: input.bytes,
      contentType: input.mimeType || "application/octet-stream",
    });
  } else {
    const abs = join(uploadsRoot(), storageKey);
    await mkdir(join(uploadsRoot(), day), { recursive: true });
    await writeFile(abs, input.bytes, { flag: "wx" });
  }

  const row = await prisma.upload.create({
    data: {
      filename,
      mimeType: input.mimeType || "application/octet-stream",
      sizeBytes: input.bytes.length,
      sha256,
      storageKey,
      uploadedById: input.uploadedById ?? null,
      jarvisTurnId: input.jarvisTurnId ?? null,
    },
  });

  logger.info("upload stored", { id: row.id, storageKey, bytes: input.bytes.length });
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    storageKey: row.storageKey,
  };
}

export async function readUpload(
  id: string,
): Promise<{ bytes: Buffer; filename: string; mimeType: string }> {
  const row = await prisma.upload.findUnique({ where: { id } });
  if (!row) throw AppError.notFound("Upload niet gevonden");

  if (env.STORAGE_BACKEND === "s3") {
    try {
      return {
        bytes: await getObjectBytes(row.storageKey),
        filename: row.filename,
        mimeType: row.mimeType,
      };
    } catch {
      throw AppError.notFound("Bestand ontbreekt in object storage");
    }
  }

  const abs = normalize(join(uploadsRoot(), row.storageKey));
  const rel = relative(uploadsRoot(), abs);
  if (rel.startsWith("..") || rel.startsWith(sep) || isAbsolute(rel)) {
    throw AppError.forbidden("Ongeldige opslagsleutel");
  }
  try {
    await stat(abs);
  } catch {
    throw AppError.notFound("Bestand ontbreekt op schijf");
  }
  return {
    bytes: await readFile(abs),
    filename: row.filename,
    mimeType: row.mimeType,
  };
}

export async function ensureStorageWritable(): Promise<{
  dir: string;
  writable: boolean;
  detail?: string;
}> {
  const dir = uploadsRoot();
  try {
    await mkdir(dir, { recursive: true });
    const probe = join(dir, `.write-test-${randomUUID()}`);
    await writeFile(probe, "ok");
    await readFile(probe);
    await (await import("node:fs/promises")).unlink(probe);
    return { dir, writable: true };
  } catch (err) {
    return { dir, writable: false, detail: (err as Error).message };
  }
}
