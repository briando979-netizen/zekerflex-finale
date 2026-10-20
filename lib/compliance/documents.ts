import { prisma } from "@/lib/prisma";
import { ComplianceDocKind, ComplianceDocStatus } from "@prisma/client";
import { storeUpload, readUpload } from "@/lib/storage/local";
import { sniffAndVerifyUploadType } from "@/lib/storage/validate";
import { AppError } from "@/lib/errors";
import { getFiscal, setFiscal } from "@/lib/fiscal/store";
import { bankLoginProvesIban, clearBankLogin } from "@/lib/kyc/bank-login";

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
  const [docs, walletVerified, bankLogin] = await Promise.all([
    listDocs(userId),
    // A verified digital-wallet (lib/kyc/wallet.ts) or Stripe Identity
    // (lib/kyc/stripe-identity.ts) check has no file to upload — it satisfies
    // the "Identiteitsbewijs" slot directly.
    prisma.identityVerification.findFirst({
      where: { userId, provider: { in: ["DIGITAL_WALLET", "STRIPE_IDENTITY"] }, status: "VERIFIED" },
      select: { id: true },
    }),
    // Logging in at your bank (lib/kyc/bank-login.ts) replaces the statement.
    bankLoginProvesIban(userId).catch(() => false),
  ]);
  const idOk = docs.some((d) => d.kind === "id" && d.status !== "rejected") || Boolean(walletVerified);
  const bankOk = bankLogin || docs.some((d) => d.kind === "bank" && d.status !== "rejected");
  return { idOk, bankOk, complete: idOk && bankOk };
}

export async function storeDoc(
  userId: string,
  kind: DocKind,
  input: { filename: string; mimeType: string; bytes: Buffer },
): Promise<ComplianceDoc> {
  if (input.bytes.length === 0) throw AppError.validation("Leeg bestand");
  if (input.bytes.length > MAX_BYTES) throw AppError.validation("Bestand te groot (max 12 MB)");
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

  // A fresh bank document clears the "payout on hold" flag a recent IBAN
  // change set — on both tracks, harmlessly a no-op on whichever doesn't apply.
  if (kind === "bank") {
    await clearIbanPendingVerification(userId).catch(() => undefined);
  }

  return toDoc(row);
}

/**
 * The old bank document no longer proves anything about a NEW account
 * number — delete it so docStatus().bankOk honestly goes back to false
 * until a fresh one is uploaded.
 */
export async function invalidateBankDoc(userId: string): Promise<void> {
  await prisma.complianceDocument.deleteMany({ where: { userId, kind: ComplianceDocKind.BANK } });
  await clearBankLogin(userId);
}

/**
 * Convenience wrapper for callers (e.g. the zzp onboarding resubmit path)
 * that don't already hold a FiscalProfile/FreelancerProfile write of their
 * own: invalidates the old bank doc AND sets the payout-hold flag on both
 * tracks in one call. See lib/timesheets/approve.ts and
 * lib/payroll/sepa-export.ts for where the hold is actually enforced.
 */
export async function flagIbanChanged(userId: string): Promise<void> {
  await Promise.all([
    invalidateBankDoc(userId),
    prisma.freelancerProfile
      .update({ where: { userId }, data: { payoutIbanPendingVerification: true } })
      .catch(() => undefined),
    setFiscal(userId, { ibanPendingVerification: true }).catch(() => undefined),
  ]);
}

async function clearIbanPendingVerification(userId: string): Promise<void> {
  await Promise.all([
    prisma.freelancerProfile
      .update({ where: { userId }, data: { payoutIbanPendingVerification: false } })
      .catch(() => undefined),
    setFiscal(userId, { ibanPendingVerification: false }).catch(() => undefined),
  ]);
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

/**
 * Admin sets a document's review status by hand (e.g. a bank statement —
 * confirms the typed IBAN actually matches the name/account shown in the
 * photo). Not used for kind "id": that document's status is governed by
 * approving/rejecting the linked IdentityVerification instead (see
 * POST /api/admin/gebruikers/<id>/identiteit/<checkId>), which also needs
 * to update the user's kycStatus in the same step.
 */
export async function setDocStatus(
  userId: string,
  docId: string,
  status: DocStatus,
): Promise<ComplianceDoc | null> {
  const row = await prisma.complianceDocument.findFirst({
    where: { id: docId.replace(/[^a-z0-9-]/gi, ""), userId },
    select: { id: true, kind: true },
  });
  if (!row) return null;
  const updated = await prisma.complianceDocument.update({
    where: { id: row.id },
    data: { status: status.toUpperCase() as ComplianceDocStatus },
    include: { upload: { select: { filename: true, mimeType: true, sizeBytes: true } } },
  });

  // A rejected bank document no longer proves the current IBAN — hold
  // payouts again until a replacement is uploaded and accepted.
  if (row.kind === ComplianceDocKind.BANK && status === "rejected") {
    await Promise.all([
      prisma.freelancerProfile
        .update({ where: { userId }, data: { payoutIbanPendingVerification: true } })
        .catch(() => undefined),
      setFiscal(userId, { ibanPendingVerification: true }).catch(() => undefined),
    ]).catch(() => undefined);
  }
  return toDoc(updated);
}
