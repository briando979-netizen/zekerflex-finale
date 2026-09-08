import { createHash } from "node:crypto";
import { kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Fiscal / BTW profile per worker — Postgres-backed (KeyValueStore, key
// "fiscal:<userId>") — was local disk, unreliable on Vercel's serverless
// functions.
//
// ZekerFlex serves three worker forms:
//   "zzp"          — own company (KVK + BTW), reverse billing
//   "flexwerker"   — flexible worker; BTW optional, may use the
//                    kleineondernemersregeling (KOR); self-invoice or reverse billing
//   "uitzendkracht"— no own company; verloning via payroll (BSN, loonheffingskorting)
//
// The database role stays FREELANCER for all three; this file carries the
// fiscal specifics used for correct invoicing / payroll.
// ---------------------------------------------------------------------------

export type WorkerKind = "zzp" | "flexwerker" | "uitzendkracht";
export type InvoiceMode = "reverse-billing" | "self-invoice" | "payroll";

export interface FiscalProfile {
  workerKind: WorkerKind | null;

  // BTW
  vatNumber: string | null;
  vatValid: boolean;
  vatStatus: string | null; // "validated" | "malformed" | "unvalidated" | ...
  vatCheckedAt: string | null;
  vatRequested: boolean; // "ik heb btw-nummer aangevraagd bij de Belastingdienst"

  // KVK (optional for flexwerker)
  kvkNumber: string | null;

  // Kleineondernemersregeling
  korApplies: boolean;

  // Payroll (uitzendkracht)
  bsnLast4: string | null;
  bsnHash: string | null; // sha256 — never store the raw BSN
  loonheffingskorting: boolean;
  /** geboortedatum (YYYY-MM-DD) — voor jeugdloon / WML-vloer */
  birthDate: string | null;

  invoiceMode: InvoiceMode | null;
  iban: string | null;
  ibanValid: boolean; // IBAN checksum (MOD-97) verified

  completedAt: string | null;
  updatedAt: string;
}

export const EMPTY_FISCAL: FiscalProfile = {
  workerKind: null,
  vatNumber: null,
  vatValid: false,
  vatStatus: null,
  vatCheckedAt: null,
  vatRequested: false,
  kvkNumber: null,
  korApplies: false,
  bsnLast4: null,
  bsnHash: null,
  loonheffingskorting: true,
  birthDate: null,
  invoiceMode: null,
  iban: null,
  ibanValid: false,
  completedAt: null,
  updatedAt: new Date(0).toISOString(),
};

const PREFIX = "fiscal:";
const key = (userId: string) => `${PREFIX}${userId}`;

export async function getFiscal(userId: string): Promise<FiscalProfile> {
  const raw = await kvGet<Partial<FiscalProfile>>(key(userId));
  return raw ? { ...EMPTY_FISCAL, ...raw } : { ...EMPTY_FISCAL };
}

export async function setFiscal(userId: string, patch: Partial<FiscalProfile>): Promise<FiscalProfile> {
  const current = await getFiscal(userId);
  const next: FiscalProfile = { ...current, ...patch, updatedAt: new Date().toISOString() };
  next.completedAt = isComplete(next) ? (current.completedAt ?? new Date().toISOString()) : null;
  await kvSet(key(userId), next);
  return next;
}

export function isComplete(f: FiscalProfile): boolean {
  if (!f.workerKind) return false;
  if (!f.iban) return false;
  if (f.workerKind === "zzp") return f.vatValid || (f.vatRequested && Boolean(f.kvkNumber));
  if (f.workerKind === "flexwerker") return f.vatValid || f.korApplies || f.vatRequested;
  if (f.workerKind === "uitzendkracht") return Boolean(f.bsnHash);
  return false;
}

export function invoiceModeFor(f: FiscalProfile): InvoiceMode {
  if (f.invoiceMode) return f.invoiceMode;
  if (f.workerKind === "uitzendkracht") return "payroll";
  if (f.workerKind === "flexwerker" && !f.vatValid && f.korApplies) return "self-invoice";
  return "reverse-billing";
}

export function hashBsn(bsn: string): { hash: string; last4: string } {
  const digits = bsn.replace(/\D/g, "");
  return { hash: createHash("sha256").update(`bsn:${digits}`).digest("hex"), last4: digits.slice(-4) };
}

/** Elfproef (BSN check digit). */
export function validBsn(bsn: string): boolean {
  const d = bsn.replace(/\D/g, "");
  if (d.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(d[i]) * (9 - i);
  sum += Number(d[8]) * -1;
  return sum % 11 === 0;
}

export interface FiscalSummary {
  userId: string;
  workerKind: WorkerKind | null;
  vatNumber: string | null;
  vatValid: boolean;
  invoiceMode: InvoiceMode;
  complete: boolean;
  updatedAt: string;
}

export async function listFiscalSummaries(): Promise<FiscalSummary[]> {
  const rows = await kvListEntries<FiscalProfile>(PREFIX, 10_000);
  return rows
    .map(({ key: k, value: rec }) => ({
      userId: k.slice(PREFIX.length),
      workerKind: rec.workerKind,
      vatNumber: rec.vatNumber,
      vatValid: rec.vatValid,
      invoiceMode: invoiceModeFor(rec),
      complete: isComplete(rec),
      updatedAt: rec.updatedAt,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
