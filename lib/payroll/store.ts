import { prisma } from "@/lib/prisma";
import type { ComputedPayslip } from "@/lib/payroll/compute";
import type { WorkerKind } from "@/lib/fiscal/store";

// ---------------------------------------------------------------------------
// Weekly payroll store — Postgres-backed (PayrollRunRecord / PayslipRecord).
// A "run" aggregates every worker with approved timesheets in that week. It is
// derived data: rebuilding a draft run re-reads the (unchanged) database.
//
// Previously this lived on local disk (storage/payroll/*.json) — unreliable
// on Vercel's serverless functions, whose filesystem is read-only outside
// /tmp. The full run/payslip objects are kept as JSON columns rather than
// fully normalised, since they're read-mostly and never queried by their
// internal fields — only by isoWeek / userId, which are real columns.
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
  /** instant advances already disbursed this week (uitzend only) */
  advance: { grossCents: number; netPaidCents: number; feeCents: number; count: number } | null;
  /** headline minus the advance the worker already received — what payroll still transfers */
  toPayCents: number;
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

export async function saveRun(run: PayrollRun): Promise<void> {
  await prisma.payrollRunRecord.upsert({
    where: { isoWeek: run.id },
    create: { isoWeek: run.id, status: run.status, data: run as object },
    update: { status: run.status, data: run as object },
  });
  await prisma.$transaction(
    run.payslips.map((slip) =>
      prisma.payslipRecord.upsert({
        where: { userId_isoWeek: { userId: slip.userId, isoWeek: slip.isoWeek } },
        create: { userId: slip.userId, isoWeek: slip.isoWeek, data: slip as object },
        update: { data: slip as object },
      }),
    ),
  );
}

export async function getRun(isoWeek: string): Promise<PayrollRun | null> {
  const row = await prisma.payrollRunRecord.findUnique({ where: { isoWeek } });
  return row ? (row.data as unknown as PayrollRun) : null;
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
  const rows = await prisma.payrollRunRecord.findMany({
    orderBy: { isoWeek: "desc" },
    take: limit,
  });
  return rows.map((row) => {
    const run = row.data as unknown as PayrollRun;
    return {
      id: run.id,
      isoWeek: run.isoWeek,
      weekLabel: run.weekLabel,
      status: run.status,
      createdAt: run.createdAt,
      workers: run.totals.workers,
      payoutCents: run.totals.payoutCents,
      fiscalIncomplete: run.totals.fiscalIncomplete,
    };
  });
}

export async function payslipsForUser(userId: string, limit = 52): Promise<PayslipRecord[]> {
  const rows = await prisma.payslipRecord.findMany({
    where: { userId },
    orderBy: { isoWeek: "desc" },
    take: limit,
  });
  return rows.map((row) => row.data as unknown as PayslipRecord);
}

export async function getPayslip(userId: string, isoWeek: string): Promise<PayslipRecord | null> {
  const row = await prisma.payslipRecord.findUnique({ where: { userId_isoWeek: { userId, isoWeek } } });
  return row ? (row.data as unknown as PayslipRecord) : null;
}
