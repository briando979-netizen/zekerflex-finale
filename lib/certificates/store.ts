import { CertificateStatus as DbCertStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storeUpload } from "@/lib/storage/local";
import { sniffAndVerifyUploadType } from "@/lib/storage/validate";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Certificaten van een kracht (VCA, BHV, heftruck, rijbewijzen, ...). Nodig
// voor uitzendwerk en voor de matching-filter. Metadata staat in Postgres
// (Certificate) — overleeft een cold start op Vercel, in tegenstelling tot
// het oude storage/certificates/<userId>.json. Het bestand zelf gaat nog
// steeds via de gedeelde upload-store (Upload-tabel).
// ---------------------------------------------------------------------------

export type CertType =
  | "VCA_BASIS"
  | "VCA_VOL"
  | "BHV"
  | "EHBO"
  | "HEFTRUCK"
  | "REACHTRUCK"
  | "RIJBEWIJS_B"
  | "RIJBEWIJS_C"
  | "RIJBEWIJS_D"
  | "SVH"
  | "OVERIG";

export type CertStatus = "pending" | "valid" | "expired" | "rejected";

export interface CertTypeSpec {
  label: string;
  /** typische geldigheidsduur in maanden (advies, alleen voor hints) */
  validMonths: number | null;
  /** regex waaraan het certificaatnummer moet voldoen, of null */
  numberPattern: RegExp | null;
  shopSlug?: string;
}

export const CERT_TYPES: Record<CertType, CertTypeSpec> = {
  VCA_BASIS: { label: "VCA Basisveiligheid (B-VCA)", validMonths: 120, numberPattern: /^[A-Za-z0-9.\-/ ]{4,32}$/, shopSlug: "vca-basis-boek" },
  VCA_VOL: { label: "VCA VOL (leidinggevenden)", validMonths: 120, numberPattern: /^[A-Za-z0-9.\-/ ]{4,32}$/ },
  BHV: { label: "BHV (bedrijfshulpverlening)", validMonths: 12, numberPattern: null },
  EHBO: { label: "EHBO", validMonths: 24, numberPattern: null },
  HEFTRUCK: { label: "Heftruckcertificaat", validMonths: 60, numberPattern: null },
  REACHTRUCK: { label: "Reachtruckcertificaat", validMonths: 60, numberPattern: null },
  RIJBEWIJS_B: { label: "Rijbewijs B (auto)", validMonths: 120, numberPattern: /^[0-9A-Z]{7,12}$/ },
  RIJBEWIJS_C: { label: "Rijbewijs C (vrachtwagen)", validMonths: 60, numberPattern: /^[0-9A-Z]{7,12}$/ },
  RIJBEWIJS_D: { label: "Rijbewijs D (bus)", validMonths: 60, numberPattern: /^[0-9A-Z]{7,12}$/ },
  SVH: { label: "SVH Sociale Hygiëne (horeca)", validMonths: null, numberPattern: null },
  OVERIG: { label: "Ander certificaat", validMonths: null, numberPattern: null },
};

export interface Certificate {
  id: string;
  userId: string;
  type: CertType;
  /** vrije naam bij type OVERIG */
  customLabel?: string;
  number?: string;
  issuedOn?: string; // YYYY-MM-DD
  expiresOn?: string; // YYYY-MM-DD
  uploadId?: string;
  fileName?: string;
  status: CertStatus;
  statusNote?: string;
  addedAt: string;
  verifiedAt?: string;
}

const STATUS_TO_DB: Record<CertStatus, DbCertStatus> = {
  pending: DbCertStatus.PENDING,
  valid: DbCertStatus.VALID,
  expired: DbCertStatus.EXPIRED,
  rejected: DbCertStatus.REJECTED,
};
const STATUS_FROM_DB: Record<DbCertStatus, CertStatus> = {
  PENDING: "pending",
  VALID: "valid",
  EXPIRED: "expired",
  REJECTED: "rejected",
};

const dateOnly = (d: Date | null): string | undefined => (d ? d.toISOString().slice(0, 10) : undefined);

function toCertificate(row: {
  id: string;
  userId: string;
  type: string;
  customLabel: string | null;
  number: string | null;
  issuedOn: Date | null;
  expiresOn: Date | null;
  uploadId: string | null;
  fileName: string | null;
  status: DbCertStatus;
  statusNote: string | null;
  addedAt: Date;
  verifiedAt: Date | null;
}): Certificate {
  const issuedOn = dateOnly(row.issuedOn);
  const expiresOn = dateOnly(row.expiresOn);
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as CertType,
    ...(row.customLabel ? { customLabel: row.customLabel } : {}),
    ...(row.number ? { number: row.number } : {}),
    ...(issuedOn ? { issuedOn } : {}),
    ...(expiresOn ? { expiresOn } : {}),
    ...(row.uploadId ? { uploadId: row.uploadId } : {}),
    ...(row.fileName ? { fileName: row.fileName } : {}),
    status: STATUS_FROM_DB[row.status],
    ...(row.statusNote ? { statusNote: row.statusNote } : {}),
    addedAt: row.addedAt.toISOString(),
    ...(row.verifiedAt ? { verifiedAt: row.verifiedAt.toISOString() } : {}),
  };
}

function freshStatus(c: Certificate): Certificate {
  if (c.status === "rejected") return c;
  if (c.expiresOn) {
    const exp = new Date(`${c.expiresOn}T23:59:59`);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      return { ...c, status: "expired" };
    }
  }
  return c;
}

export async function listCertificates(userId: string): Promise<Certificate[]> {
  const rows = await prisma.certificate.findMany({ where: { userId }, orderBy: { addedAt: "desc" } });
  return rows.map(toCertificate).map(freshStatus);
}

/** Deterministische controle bij toevoegen. */
function evaluate(input: {
  type: CertType;
  number?: string | undefined;
  issuedOn?: string | undefined;
  expiresOn?: string | undefined;
  hasFile: boolean;
}): { status: CertStatus; note: string } {
  const spec = CERT_TYPES[input.type];
  const now = Date.now();

  if (input.expiresOn) {
    const exp = new Date(`${input.expiresOn}T23:59:59`);
    if (Number.isNaN(exp.getTime())) return { status: "pending", note: "Vervaldatum onleesbaar — handmatige controle." };
    if (exp.getTime() < now) return { status: "expired", note: "Het certificaat is verlopen." };
    if (exp.getTime() > now + 20 * 365 * 24 * 3600_000) {
      return { status: "pending", note: "Vervaldatum lijkt onrealistisch ver — handmatige controle." };
    }
  }

  if (spec.numberPattern && input.number && !spec.numberPattern.test(input.number.trim())) {
    return { status: "pending", note: "Certificaatnummer heeft niet het verwachte formaat — handmatige controle." };
  }

  if (!input.hasFile) {
    return { status: "pending", note: "Upload een scan of foto zodat we het kunnen valideren." };
  }
  if (!input.expiresOn && spec.validMonths !== null) {
    return { status: "pending", note: "Vul de vervaldatum in voor automatische goedkeuring." };
  }

  return { status: "valid", note: "Automatisch goedgekeurd op basis van de ingevulde gegevens." };
}

export interface AddCertificateInput {
  type: CertType;
  customLabel?: string | undefined;
  number?: string | undefined;
  issuedOn?: string | undefined;
  expiresOn?: string | undefined;
  file?: { filename: string; mimeType: string; bytes: Buffer } | undefined;
}

export async function addCertificate(userId: string, input: AddCertificateInput): Promise<Certificate> {
  if (!(input.type in CERT_TYPES)) throw AppError.validation("Onbekend certificaattype");

  let uploadId: string | undefined;
  let fileName: string | undefined;
  if (input.file && input.file.bytes.length > 0) {
    const verifiedMimeType = sniffAndVerifyUploadType(input.file.bytes, ["pdf", "jpeg", "png", "webp"]);
    const stored = await storeUpload({
      filename: input.file.filename,
      mimeType: verifiedMimeType,
      bytes: input.file.bytes,
      uploadedById: userId,
    });
    uploadId = stored.id;
    fileName = stored.filename;
  }

  const { status, note } = evaluate({
    type: input.type,
    number: input.number,
    issuedOn: input.issuedOn,
    expiresOn: input.expiresOn,
    hasFile: Boolean(uploadId),
  });

  const now = new Date();
  const row = await prisma.certificate.create({
    data: {
      userId,
      type: input.type,
      customLabel: input.customLabel?.slice(0, 80) ?? null,
      number: input.number?.trim().slice(0, 40) ?? null,
      issuedOn: input.issuedOn ? new Date(`${input.issuedOn}T00:00:00`) : null,
      expiresOn: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00`) : null,
      uploadId: uploadId ?? null,
      fileName: fileName ?? null,
      status: STATUS_TO_DB[status],
      statusNote: note,
      addedAt: now,
      verifiedAt: status === "valid" ? now : null,
    },
  });
  return toCertificate(row);
}

export async function deleteCertificate(userId: string, id: string): Promise<void> {
  await prisma.certificate.deleteMany({ where: { id, userId } });
}

export async function getCertificate(userId: string, id: string): Promise<Certificate | null> {
  const row = await prisma.certificate.findFirst({ where: { id, userId } });
  return row ? freshStatus(toCertificate(row)) : null;
}

/** De certificaattypes waarvan de kracht een geldig (niet-verlopen) bewijs heeft. */
export async function validCertTypes(userId: string): Promise<Set<CertType>> {
  const items = await listCertificates(userId);
  return new Set(items.filter((c) => c.status === "valid").map((c) => c.type));
}

export function certLabel(c: Pick<Certificate, "type" | "customLabel">): string {
  return c.type === "OVERIG" && c.customLabel ? c.customLabel : CERT_TYPES[c.type].label;
}
