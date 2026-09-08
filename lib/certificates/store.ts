import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { storeUpload } from "@/lib/storage/local";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Certificaten van een kracht (VCA, BHV, heftruck, rijbewijzen, ...). Nodig
// voor uitzendwerk en voor de matching-filter. Filesystem, non-destructief:
//   storage/certificates/<userId>.json  → { items: Certificate[] }
// Het bestand zelf gaat via de gedeelde upload-store (Upload-tabel).
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

function dir(): string {
  return join(process.cwd(), "storage", "certificates");
}
function file(userId: string): string {
  return join(dir(), `${userId.replace(/[^a-z0-9-]/gi, "")}.json`);
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
  const p = file(userId);
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(await readFile(p, "utf8")) as { items?: Certificate[] };
    return (raw.items ?? []).map(freshStatus).sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  } catch {
    return [];
  }
}

async function writeAll(userId: string, items: Certificate[]): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await writeFile(file(userId), JSON.stringify({ items }, null, 2), "utf8");
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
    const stored = await storeUpload({
      filename: input.file.filename,
      mimeType: input.file.mimeType,
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

  const now = new Date().toISOString();
  const cert: Certificate = {
    id: randomUUID().slice(0, 12),
    userId,
    type: input.type,
    ...(input.customLabel ? { customLabel: input.customLabel.slice(0, 80) } : {}),
    ...(input.number ? { number: input.number.trim().slice(0, 40) } : {}),
    ...(input.issuedOn ? { issuedOn: input.issuedOn } : {}),
    ...(input.expiresOn ? { expiresOn: input.expiresOn } : {}),
    ...(uploadId ? { uploadId, ...(fileName ? { fileName } : {}) } : {}),
    status,
    statusNote: note,
    addedAt: now,
    ...(status === "valid" ? { verifiedAt: now } : {}),
  };

  const items = await listCertificates(userId);
  items.unshift(cert);
  await writeAll(userId, items);
  return cert;
}

export async function deleteCertificate(userId: string, id: string): Promise<void> {
  const items = await listCertificates(userId);
  await writeAll(userId, items.filter((c) => c.id !== id));
}

export async function getCertificate(userId: string, id: string): Promise<Certificate | null> {
  return (await listCertificates(userId)).find((c) => c.id === id) ?? null;
}

/** De certificaattypes waarvan de kracht een geldig (niet-verlopen) bewijs heeft. */
export async function validCertTypes(userId: string): Promise<Set<CertType>> {
  const items = await listCertificates(userId);
  return new Set(items.filter((c) => c.status === "valid").map((c) => c.type));
}

export function certLabel(c: Pick<Certificate, "type" | "customLabel">): string {
  return c.type === "OVERIG" && c.customLabel ? c.customLabel : CERT_TYPES[c.type].label;
}
