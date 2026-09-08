import { prisma } from "@/lib/prisma";
import { ComplianceDocKind, ComplianceDocStatus } from "@prisma/client";
import { storeUpload, readUpload } from "@/lib/storage/local";
import { sniffAndVerifyUploadType } from "@/lib/storage/validate";

// ---------------------------------------------------------------------------
// Verplichte verificatiedocumenten per account: identiteitsbewijs +
// (voor IBAN-controle) een bankafschrift/tenaamstelling. Bytes gaan via de
// gedeelde Upload-store (lokaal of S3); metadata + reviewstatus staat in
// Postgres (ComplianceDocument) — beide overleven een cold start op Vercel,
// in tegenstelling tot het oude storage/compliance/<userId>/index.json.
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

const KIND_TO_DB: Record<DocKind, ComplianceDocKind> = {
  id: ComplianceDocKind.ID,
  bank: ComplianceDocKind.BANK,
  other: ComplianceDocKind.OTHER,
};
const KIND_FROM_DB: Record<ComplianceDocKind, DocKind> = {
  ID: "id",
  BANK: "bank",
  OTHER: "other",
};
const STATUS_FROM_DB: Record<ComplianceDocStatus, DocStatus> = {
  UPLOADED: "uploaded",
  APPROVED: "approved",
  REJECTED: "rejected",
};

function toDoc(row: {
  id: string;
  kind: ComplianceDocKind;
  status: ComplianceDocStatus;
  note: string | null;
  uploadedAt: Date;
  upload: { filename: string; mimeType: string; sizeBytes: number };
}): ComplianceDoc {
  return {
    id: row.id,
    kind: KIND_FROM_DB[row.kind],
    filename: row.upload.filename,
    mimeType: row.upload.mimeType,
    sizeBytes: row.upload.sizeBytes,
    uploadedAt: row.uploadedAt.toISOString(),
    status: STATUS_FROM_DB[row.status],
    ...(row.note ? { note: row.note } : {}),
  };
}

export async function listDocs(userId: string): Promise<ComplianceDoc[]> {
  const rows = await prisma.complianceDocument.findMany({
    where: { userId },
    orderBy: { uploadedAt: "desc" },
    include: { upload: { select: { filename: true, mimeType: true, sizeBytes: true } } },
  });
  return rows.map(toDoc);
}

export async function docStatus(userId: string): Promise<{ idOk: boolean; bankOk: boolean; complete: boolean }> {
  const docs = await listDocs(userId);
  const idOk = docs.some((d) => d.kind === "id" && d.status !== "rejected");
  const bankOk = docs.some((d) => d.kind === "bank" && d.status !== "rejected");
  return { idOk, bankOk, complete: idOk && bankOk };
}

export async function storeDoc(
  userId: string,
  kind: DocKind,
  input: { filename: string; mimeType: string; bytes: Buffer },
): Promise<ComplianceDoc> {
  if (input.bytes.length === 0) throw new Error("Leeg bestand");
  if (input.bytes.length > MAX_BYTES) throw new Error("Bestand te groot (max 12 MB)");
  // Sniffed from the actual bytes, never the client-supplied Content-Type —
  // an ID/bank document upload is exactly the kind of endpoint MIME spoofing
  // targets (e.g. claiming image/jpeg on an HTML file with a script tag).
  const mime = sniffAndVerifyUploadType(input.bytes, ["pdf", "jpeg", "png", "webp"]);

  const stored = await storeUpload({
    filename: input.filename,
    mimeType: mime,
    bytes: input.bytes,
    uploadedById: userId,
  });

  const dbKind = KIND_TO_DB[kind];
  // one active doc per kind (except "other") — supersede the previous
  if (dbKind !== ComplianceDocKind.OTHER) {
    await prisma.complianceDocument.deleteMany({ where: { userId, kind: dbKind } });
  }

  const row = await prisma.complianceDocument.create({
    data: { userId, kind: dbKind, uploadId: stored.id },
    include: { upload: { select: { filename: true, mimeType: true, sizeBytes: true } } },
  });
  return toDoc(row);
}

export async function readDoc(
  userId: string,
  docId: string,
): Promise<{ bytes: Buffer; filename: string; mimeType: string } | null> {
  const row = await prisma.complianceDocument.findFirst({
    where: { id: docId.replace(/[^a-z0-9-]/gi, ""), userId },
    select: { uploadId: true },
  });
  if (!row) return null;
  try {
    return await readUpload(row.uploadId);
  } catch {
    return null;
  }
}
