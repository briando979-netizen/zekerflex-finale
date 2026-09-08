import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getFiscal } from "@/lib/fiscal/store";
import { getUitzendStatus } from "@/lib/payroll/uitzend-status";

// ---------------------------------------------------------------------------
// Uitzendovereenkomst — the temp-work employment contract between ZekerFlex
// (formeel werkgever) and the uitzendkracht. Signed once during onboarding by
// tapping "Ondertekenen"; valid 3 kalendermaanden, then a fresh one is signed
// to keep working. Electronically signed (no wet signature), like the
// modelovereenkomst. Filesystem, non-destructive.
//   storage/agreements/uitzend/<userId>.jsonl
// ---------------------------------------------------------------------------

export const CONTRACT_MONTHS = 3;
const EMPLOYER_NAME = "ZekerFlex B.V.";
const EMPLOYER_KVK = "00000000";

export interface UitzendContract {
  id: string;
  reference: string;
  userId: string;
  workerName: string;
  workerBsnLast4: string | null;
  employerName: string;
  employerKvk: string;
  signedAt: string;
  validFrom: string;
  validUntil: string;
  /** ABU phase at signing */
  phase: "A" | "B" | "C";
  weeksWorked: number;
}

function dir(): string {
  return join(process.cwd(), "storage", "agreements", "uitzend");
}
function file(userId: string): string {
  return join(dir(), `${userId.replace(/[^a-z0-9-]/gi, "")}.jsonl`);
}

function addMonths(d: Date, m: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
}

export async function listUitzendContracts(userId: string): Promise<UitzendContract[]> {
  const p = file(userId);
  if (!existsSync(p)) return [];
  const out: UitzendContract[] = [];
  for (const l of (await readFile(p, "utf8")).split("\n").filter(Boolean)) {
    try {
      out.push(JSON.parse(l) as UitzendContract);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.signedAt < b.signedAt ? 1 : -1));
}

/** The most recent contract that is still within its validity window. */
export async function activeUitzendContract(userId: string): Promise<UitzendContract | null> {
  const now = Date.now();
  const all = await listUitzendContracts(userId);
  return all.find((c) => new Date(c.validUntil).getTime() > now) ?? null;
}

/**
 * Sign a new uitzendovereenkomst for this worker (or return the still-valid
 * one). Electronic signature = the moment of this call.
 */
export async function signUitzendContract(
  userId: string,
  workerName: string,
): Promise<{ contract: UitzendContract; created: boolean }> {
  const existing = await activeUitzendContract(userId);
  if (existing) return { contract: existing, created: false };

  const [fiscal, status] = await Promise.all([getFiscal(userId), getUitzendStatus(userId)]);
  const now = new Date();
  const year = now.getFullYear();
  const all = await listUitzendContracts(userId);
  const reference = `ZF-UZO-${year}-${String(all.length + 1).padStart(3, "0")}-${userId.replace(/[^a-z0-9]/gi, "").slice(0, 6)}`;

  const contract: UitzendContract = {
    id: randomUUID().slice(0, 12),
    reference,
    userId,
    workerName,
    workerBsnLast4: fiscal.bsnLast4,
    employerName: EMPLOYER_NAME,
    employerKvk: EMPLOYER_KVK,
    signedAt: now.toISOString(),
    validFrom: now.toISOString(),
    validUntil: addMonths(now, CONTRACT_MONTHS).toISOString(),
    phase: status?.phase ?? "A",
    weeksWorked: status?.weeksWorked ?? 0,
  };

  await mkdir(dir(), { recursive: true });
  await appendFile(file(userId), JSON.stringify(contract) + "\n", "utf8");
  return { contract, created: true };
}
