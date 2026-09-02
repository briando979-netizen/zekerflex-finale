import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ComputedPayslip } from "@/lib/payroll/compute";
import type { WorkerKind } from "@/lib/fiscal/store";

// ---------------------------------------------------------------------------
// Weekly payroll store — filesystem only, non-destructive.
//   storage/payroll/runs/<isoWeek>.json          — one run per ISO week
//   storage/payroll/payslips/<userId>/<isoWeek>.json — per-worker payslip copy
//
// A "run" aggregates every worker with approved timesheets in that week. It is
// derived data: rebuilding a draft run re-reads the (unchanged) database.
// ---------------------------------------------------------------------------

export type RunStatus = "draft" | "finalised";

export interface PayslipRecord {
  userId: string;
  freelancerId: string;
  workerName: string;
  workerEmail: string | null;
  workerKind: WorkerKind | null;
  isoWeek: string;
  weekLabel: string;
  weeksWorked: number;
  fiscalComplete: boolean;
  computed: ComputedPayslip;
  generatedAt: string;
}

export interface PayrollRun {
  id: string; // === isoWeek
  isoWeek: string;
  weekLabel: string;
  status: RunStatus;
  createdAt: string;
  createdBy: string;
  finalisedAt: string | null;
  finalisedBy: string | null;
  totals: {
    workers: number;
    payrollWorkers: number;
    invoiceWorkers: number;
    grossCents: number;
    payoutCents: number;
    fiscalIncomplete: number;
  };
  payslips: PayslipRecord[];
}

function root(): string {
  return join(process.cwd(), "storage", "payroll");
}
const runsDir = () => join(root(), "runs");
const payslipDir = (userId: string) =>
  join(root(), "payslips", userId.replace(/[^a-zA-Z0-9_-]/g, ""));

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");

export async function saveRun(run: PayrollRun): Promise<void> {
  await mkdir(runsDir(), { recursive: true });
  await writeFile(join(runsDir(), `${safe(run.id)}.json`), JSON.stringify(run, null, 2), "utf8");
  for (const slip of run.payslips) {
    const dir = payslipDir(slip.userId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${safe(slip.isoWeek)}.json`), JSON.stringify(slip, null, 2), "utf8");
  }
}

export async function getRun(isoWeek: string): Promise<PayrollRun | null> {
  const p = join(runsDir(), `${safe(isoWeek)}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await readFile(p, "utf8")) as PayrollRun;
  } catch {
    return null;
  }
}

export interface RunSummary {
  id: string;
  isoWeek: string;
  weekLabel: string;
  status: RunStatus;
  createdAt: string;
  workers: number;
  payoutCents: number;
  fiscalIncomplete: number;
}

export async function listRuns(limit = 26): Promise<RunSummary[]> {
  if (!existsSync(runsDir())) return [];
  const files = (await readdir(runsDir())).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
  const out: RunSummary[] = [];
  for (const f of files) {
    try {
      const run = JSON.parse(await readFile(join(runsDir(), f), "utf8")) as PayrollRun;
      out.push({
        id: run.id,
        isoWeek: run.isoWeek,
        weekLabel: run.weekLabel,
        status: run.status,
        createdAt: run.createdAt,
        workers: run.totals.workers,
        payoutCents: run.totals.payoutCents,
        fiscalIncomplete: run.totals.fiscalIncomplete,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function payslipsForUser(userId: string, limit = 52): Promise<PayslipRecord[]> {
  const dir = payslipDir(userId);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
  const out: PayslipRecord[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(dir, f), "utf8")) as PayslipRecord);
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function getPayslip(userId: string, isoWeek: string): Promise<PayslipRecord | null> {
  const p = join(payslipDir(userId), `${safe(isoWeek)}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await readFile(p, "utf8")) as PayslipRecord;
  } catch {
    return null;
  }
}
