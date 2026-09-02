import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Fiscal / BTW profile per worker — filesystem, non-destructive.
//   storage/fiscal/<userId>.json
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
  invoiceMode: null,
  iban: null,
  ibanValid: false,
  completedAt: null,
  updatedAt: new Date(0).toISOString(),
};

function dir(): string {
  return join(process.cwd(), "storage", "fiscal");
}
function path(userId: string): string {
  return join(dir(), `${userId.replace(/[^a-zA-Z0-9_-]/g, "")}.json`);
}

export async function getFiscal(userId: string): Promise<FiscalProfile> {
  const p = path(userId);
  if (!existsSync(p)) return { ...EMPTY_FISCAL };
  try {
    return { ...EMPTY_FISCAL, ...(JSON.parse(await readFile(p, "utf8")) as Partial<FiscalProfile>) };
  } catch {
    return { ...EMPTY_FISCAL };
  }
}

export async function setFiscal(userId: string, patch: Partial<FiscalProfile>): Promise<FiscalProfile> {
  await mkdir(dir(), { recursive: true });
  const current = await getFiscal(userId);
  const next: FiscalProfile = { ...current, ...patch, updatedAt: new Date().toISOString() };
  next.completedAt = isComplete(next) ? (current.completedAt ?? new Date().toISOString()) : null;
  await writeFile(path(userId), JSON.stringify(next, null, 2), "utf8");
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
  if (!existsSync(dir())) return [];
  const files = (await readdir(dir())).filter((f) => f.endsWith(".json"));
  const out: FiscalSummary[] = [];
  for (const f of files) {
    try {
      const rec = JSON.parse(await readFile(join(dir(), f), "utf8")) as FiscalProfile;
      out.push({
        userId: f.replace(/\.json$/, ""),
        workerKind: rec.workerKind,
        vatNumber: rec.vatNumber,
        vatValid: rec.vatValid,
        invoiceMode: invoiceModeFor(rec),
        complete: isComplete(rec),
        updatedAt: rec.updatedAt,
      });
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
