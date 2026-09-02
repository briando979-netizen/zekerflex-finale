import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize, relative, sep } from "node:path";

// ---------------------------------------------------------------------------
// Verplichte verificatiedocumenten per account: identiteitsbewijs +
// (voor IBAN-controle) een bankafschrift/tenaamstelling. Files on disk, a
// per-user index JSON. No Big-Tech, no DB schema change.
//   storage/compliance/<userId>/<docId>            — the bytes
//   storage/compliance/<userId>/index.json         — metadata + review status
// ---------------------------------------------------------------------------

export type DocKind = "id" | "bank" | "other";
export type DocStatus = "uploaded" | "approved" | "rejected";

export interface ComplianceDoc {
  id: string;
  kind: DocKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  status: DocStatus;
  note?: string;
}

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = [/^image\/(jpe?g|png|webp|heic|heif)$/i, /^application\/pdf$/i];

function userDir(userId: string): string {
  return join(process.cwd(), "storage", "compliance", userId.replace(/[^a-z0-9-]/gi, ""));
}
function jailed(userId: string, name: string): string {
  const d = userDir(userId);
  const abs = normalize(join(d, name));
  if (relative(d, abs).startsWith("..") || relative(d, abs).startsWith(sep)) throw new Error("path escape");
  return abs;
}
const indexPath = (userId: string) => jailed(userId, "index.json");

async function readIndex(userId: string): Promise<ComplianceDoc[]> {
  const p = indexPath(userId);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(await readFile(p, "utf8")) as ComplianceDoc[];
  } catch {
    return [];
  }
}
async function writeIndex(userId: string, docs: ComplianceDoc[]): Promise<void> {
  await mkdir(userDir(userId), { recursive: true });
  await writeFile(indexPath(userId), JSON.stringify(docs, null, 2), "utf8");
}

export async function listDocs(userId: string): Promise<ComplianceDoc[]> {
  return (await readIndex(userId)).sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export async function docStatus(userId: string): Promise<{ idOk: boolean; bankOk: boolean; complete: boolean }> {
  const docs = await readIndex(userId);
  const idOk = docs.some((d) => d.kind === "id" && d.status !== "rejected");
  const bankOk = docs.some((d) => d.kind === "bank" && d.status !== "rejected");
  return { idOk, bankOk, complete: idOk && bankOk };
}

export async function storeDoc(
  userId: string,
  kind: DocKind,
  input: { filename: string; mimeType: string; bytes: Buffer },
): Promise<ComplianceDoc> {
  const mime = input.mimeType || "application/octet-stream";
  if (!ALLOWED.some((re) => re.test(mime))) throw new Error("Alleen JPG, PNG of PDF");
  if (input.bytes.length === 0) throw new Error("Leeg bestand");
  if (input.bytes.length > MAX_BYTES) throw new Error("Bestand te groot (max 12 MB)");

  const id = randomUUID().slice(0, 16);
  await mkdir(userDir(userId), { recursive: true });
  await writeFile(jailed(userId, id), input.bytes, { flag: "wx" });

  const docs = await readIndex(userId);
  // one active doc per kind (except "other") — supersede the previous
  const kept = kind === "other" ? docs : docs.filter((d) => d.kind !== kind);
  const doc: ComplianceDoc = {
    id,
    kind,
    filename: input.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 160) || "document",
    mimeType: mime,
    sizeBytes: input.bytes.length,
    uploadedAt: new Date().toISOString(),
    status: "uploaded",
  };
  await writeIndex(userId, [...kept, doc]);
  return doc;
}

export async function readDoc(
  userId: string,
  docId: string,
): Promise<{ bytes: Buffer; filename: string; mimeType: string } | null> {
  const docs = await readIndex(userId);
  const doc = docs.find((d) => d.id === docId.replace(/[^a-z0-9-]/gi, ""));
  if (!doc) return null;
  const p = jailed(userId, doc.id);
  if (!existsSync(p)) return null;
  return { bytes: await readFile(p), filename: doc.filename, mimeType: doc.mimeType };
}
