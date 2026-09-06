import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

const MAX_BYTES = 10 * 1024 * 1024;
const ROOT = resolve(process.env.UPLOADS_DIR || resolve(process.cwd(), "storage", "uploads"));
const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "text/plain": [".txt"],
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
};

function safeName(filename: string): string {
  const name = filename.normalize("NFKC").replace(/[\\/\0\r\n]/g, "_").replace(/[^\p{L}\p{N} ._-]/gu, "_").trim();
  return (name || "bestand").slice(0, 160);
}

function detectedMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString() === "ftyp") return "image/heic";
  if (!bytes.includes(0) && !bytes.subarray(0, 1024).some((byte) => byte < 9 || (byte > 13 && byte < 32))) return "text/plain";
  return null;
}

function confinedPath(storageKey: string): string {
  const path = resolve(ROOT, storageKey);
  if (path !== ROOT && !path.startsWith(`${ROOT}${sep}`)) throw AppError.forbidden("Invalid storage path");
  return path;
}

export async function storeUpload(input: { filename: string; mimeType: string; bytes: Buffer; uploadedById?: string }) {
  if (input.bytes.length === 0 || input.bytes.length > MAX_BYTES) throw AppError.validation("Bestandsgrootte is ongeldig");
  const filename = safeName(input.filename);
  const mimeType = detectedMime(input.bytes);
  const extension = extname(filename).toLowerCase();
  if (!mimeType || !MIME_EXTENSIONS[mimeType]?.includes(extension) || input.mimeType !== mimeType) {
    throw AppError.validation("Bestandstype komt niet overeen met de inhoud");
  }
  const day = new Date().toISOString().slice(0, 10);
  const storageKey = `${day}/${randomUUID()}-${filename}`;
  const path = confinedPath(storageKey);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, input.bytes, { mode: 0o600, flag: "wx" });
  return prisma.upload.create({ data: {
    filename, mimeType, sizeBytes: input.bytes.length,
    sha256: createHash("sha256").update(input.bytes).digest("hex"), storageKey,
    ...(input.uploadedById ? { uploadedById: input.uploadedById } : {}),
  } });
}

export async function readUpload(id: string) {
  const record = await prisma.upload.findUnique({ where: { id } });
  if (!record) throw AppError.notFound("Bestand niet gevonden");
  return { ...record, bytes: await readFile(confinedPath(record.storageKey)) };
}

export async function ensureStorageWritable(): Promise<{ dir: string; writable: boolean; detail?: string }> {
  try {
    await mkdir(ROOT, { recursive: true, mode: 0o700 });
    const probe = resolve(ROOT, `.probe-${randomUUID()}`);
    await writeFile(probe, "", { mode: 0o600 });
    const { unlink } = await import("node:fs/promises");
    await unlink(probe);
    return { dir: ROOT, writable: true };
  } catch (error) {
    return { dir: ROOT, writable: false, detail: (error as Error).message };
  }
}
