import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getFiscal, invoiceModeFor, isComplete } from "@/lib/fiscal/store";
import { computePayslip, type PayLineInput } from "@/lib/payroll/compute";
import { getRun, saveRun, type PayrollRun, type PayslipRecord } from "@/lib/payroll/store";
import {
  isoWeekId,
  isoWeekLabel,
  isoWeekOf,
  isoWeekRange,
  parseIsoWeekId,
  type IsoWeek,
} from "@/lib/payroll/week";

// ---------------------------------------------------------------------------
// Build a weekly payroll run from APPROVED/PAID timesheets. READ-ONLY against
// the database — every mutation goes to the filesystem via the payroll store.
// A finalised run is never rebuilt.
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Distinct ISO weeks a freelancer has an approved/paid timesheet for, up to `week`. */
async function cumulativeWeeksWorked(freelancerId: string, upTo: IsoWeek): Promise<number> {
  const { end } = isoWeekRange(upTo);
  const rows = await prisma.timesheet.findMany({
    where: {
      freelancerId,
      status: { in: ["APPROVED", "PAID"] },
      scheduledStart: { lt: end },
    },
    select: { scheduledStart: true },
  });
  const weeks = new Set(rows.map((r) => isoWeekId(isoWeekOf(r.scheduledStart))));
  return weeks.size;
}

export interface BuildRunResult {
  run: PayrollRun;
  rebuilt: boolean;
}

export async function buildWeeklyRun(isoWeekIdStr: string, createdBy: string): Promise<BuildRunResult> {
  const week = parseIsoWeekId(isoWeekIdStr);
  if (!week) throw new Error(`Ongeldige weeknotatie: ${isoWeekIdStr} (verwacht 2026-W35)`);

  const existing = await getRun(isoWeekIdStr);
  if (existing?.status === "finalised") {
    return { run: existing, rebuilt: false };
  }

  const { start, end } = isoWeekRange(week);
  const timesheets = await prisma.timesheet.findMany({
    where: {
      status: { in: ["APPROVED", "PAID"] },
      scheduledStart: { gte: start, lt: end },
      billableMinutes: { gt: 0 },
    },
    select: {
      id: true,
      freelancerId: true,
      billableMinutes: true,
      hourlyRateCents: true,
      scheduledStart: true,
      freelancer: {
        select: { id: true, userId: true, user: { select: { fullName: true, email: true } } },
      },
      assignment: { select: { shift: { select: { id: true, title: true } } } },
      branch: { select: { name: true, tenant: { select: { name: true } } } },
    },
  });

  // Group by worker (userId).
  const byUser = new Map<
    string,
    { freelancerId: string; name: string; email: string | null; lines: PayLineInput[] }
  >();
  for (const t of timesheets) {
    const userId = t.freelancer.userId;
    const bucket =
      byUser.get(userId) ??
      {
        freelancerId: t.freelancer.id,
        name: t.freelancer.user.fullName,
        email: t.freelancer.user.email ?? null,
        lines: [] as PayLineInput[],
      };
    bucket.lines.push({
      shiftId: t.assignment?.shift?.id ?? t.id,
      shiftTitle: t.assignment?.shift?.title ?? "Dienst",
      clientName: t.branch?.tenant?.name ?? t.branch?.name ?? "Opdrachtgever",
      workedOn: t.scheduledStart.toISOString().slice(0, 10),
      hours: round2(t.billableMinutes / 60),
      hourlyRateCents: t.hourlyRateCents,
    });
    byUser.set(userId, bucket);
  }

  const weekLabel = isoWeekLabel(week);
  const now = new Date().toISOString();
  const payslips: PayslipRecord[] = [];

  for (const [userId, b] of byUser) {
    const fiscal = await getFiscal(userId);
    const weeksWorked = await cumulativeWeeksWorked(b.freelancerId, week);
    const computed = computePayslip({
      workerKind: fiscal.workerKind ?? "uitzendkracht",
      invoiceMode: invoiceModeFor(fiscal),
      vatValid: fiscal.vatValid,
      korApplies: fiscal.korApplies,
      loonheffingskorting: fiscal.loonheffingskorting,
      weeksWorked,
      lines: b.lines,
    });
    payslips.push({
      userId,
      freelancerId: b.freelancerId,
      workerName: b.name,
      workerEmail: b.email,
      workerKind: fiscal.workerKind,
      isoWeek: isoWeekIdStr,
      weekLabel,
      weeksWorked,
      fiscalComplete: isComplete(fiscal),
      computed,
      generatedAt: now,
    });
  }

  payslips.sort((a, b) => b.computed.headlineCents - a.computed.headlineCents);

  const payrollWorkers = payslips.filter((p) => p.computed.breakdown.kind === "payroll").length;
  const run: PayrollRun = {
    id: isoWeekIdStr,
    isoWeek: isoWeekIdStr,
    weekLabel,
    status: "draft",
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? createdBy,
    finalisedAt: null,
    finalisedBy: null,
    totals: {
      workers: payslips.length,
      payrollWorkers,
      invoiceWorkers: payslips.length - payrollWorkers,
      grossCents: payslips.reduce(
        (s, p) =>
          s +
          (p.computed.breakdown.kind === "payroll"
            ? p.computed.breakdown.grossCents
            : p.computed.breakdown.servicesCents),
        0,
      ),
      payoutCents: payslips.reduce((s, p) => s + p.computed.headlineCents, 0),
      fiscalIncomplete: payslips.filter((p) => !p.fiscalComplete).length,
    },
    payslips,
  };

  await saveRun(run);
  logger.info("payroll run built", {
    isoWeek: isoWeekIdStr,
    workers: run.totals.workers,
    payoutCents: run.totals.payoutCents,
  });
  return { run, rebuilt: Boolean(existing) };
}

export async function finaliseRun(isoWeekIdStr: string, by: string): Promise<PayrollRun> {
  const run = await getRun(isoWeekIdStr);
  if (!run) throw new Error("Run niet gevonden — bouw hem eerst.");
  if (run.status === "finalised") return run;
  run.status = "finalised";
  run.finalisedAt = new Date().toISOString();
  run.finalisedBy = by;
  await saveRun(run);
  logger.info("payroll run finalised", { isoWeek: isoWeekIdStr, by });
  return run;
}
