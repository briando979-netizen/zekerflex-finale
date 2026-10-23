import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";

// ---------------------------------------------------------------------------
// Shopify-stijl dashboardcijfers voor de OPDRACHTGEVER, afgeschermd op de eigen
// organisatie: uitgegeven (7d + WoW), gewerkte uren + actieve flexwerkers,
// bezetting (vervulde/totaal klussen), uren te keuren, 30-daagse reeks en een
// activiteitenfeed van de eigen diensten. Echte data, best-effort met fallbacks.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export interface EmployerDashboardStats {
  spentCents: number; // laatste 7 dagen
  spentChangePct: number;
  workedHours: number; // laatste 7 dagen
  activeWorkersToday: number;
  fillRate: number; // 0..1, 30 dagen
  shiftsFilled: number;
  shiftsTotal: number;
  hoursToApprove: number;
  series: { date: string; spentCents: number; hours: number }[];
  activity: { at: string; text: string }[];
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function employerDashboardStats(principal: Principal, now = new Date()): Promise<EmployerDashboardStats> {
  const scope = await resolveEmployerScope(principal);
  const branchFilter = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [spendWeek, spendPrev, invoices, timesheets, shiftsTotal, shiftsFilled, toApprove, activeToday, recentTs, recentAssign] = await Promise.all([
    safe(() => prisma.invoice.aggregate({ where: { recipientTenantId: { in: scope.tenantIds }, status: { in: ["PAID", "ISSUED"] }, createdAt: { gte: weekAgo } }, _sum: { totalCents: true } }), { _sum: { totalCents: null } }),
    safe(() => prisma.invoice.aggregate({ where: { recipientTenantId: { in: scope.tenantIds }, status: { in: ["PAID", "ISSUED"] }, createdAt: { gte: twoWeeksAgo, lt: weekAgo } }, _sum: { totalCents: true } }), { _sum: { totalCents: null } }),
    safe(() => prisma.invoice.findMany({ where: { recipientTenantId: { in: scope.tenantIds }, status: { in: ["PAID", "ISSUED"] }, createdAt: { gte: monthAgo } }, select: { totalCents: true, createdAt: true }, take: 20_000 }), [] as { totalCents: number; createdAt: Date }[]),
    safe(() => prisma.timesheet.findMany({ where: { branch: branchFilter, status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: monthAgo } }, select: { billableMinutes: true, scheduledStart: true }, take: 50_000 }), [] as { billableMinutes: number; scheduledStart: Date }[]),
    safe(() => prisma.shift.count({ where: { branch: branchFilter, startsAt: { gte: monthAgo, lt: now } } }), 0),
    safe(() => prisma.shift.count({ where: { branch: branchFilter, startsAt: { gte: monthAgo, lt: now }, status: "FILLED" } }), 0),
    safe(() => prisma.timesheet.count({ where: { branch: branchFilter, status: "SUBMITTED" } }), 0),
    safe(() => prisma.shiftAssignment.findMany({ where: { cancelledAt: null, shift: { branch: branchFilter, startsAt: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY) } } }, select: { freelancerId: true }, take: 5000 }), [] as { freelancerId: string }[]),
    safe(
      () => prisma.timesheet.findMany({ where: { branch: branchFilter, status: "APPROVED", approvedAt: { not: null } }, orderBy: { approvedAt: "desc" }, take: 6, select: { approvedAt: true, freelancer: { select: { user: { select: { fullName: true } } } }, branch: { select: { name: true } } } }),
      [] as { approvedAt: Date | null; freelancer: { user: { fullName: string } }; branch: { name: string } }[],
    ),
    safe(
      () => prisma.shiftAssignment.findMany({ where: { cancelledAt: null, shift: { branch: branchFilter } }, orderBy: { acceptedAt: "desc" }, take: 6, select: { acceptedAt: true, freelancer: { select: { user: { select: { fullName: true } } } }, shift: { select: { title: true } } } }),
      [] as { acceptedAt: Date; freelancer: { user: { fullName: string } }; shift: { title: string } }[],
    ),
  ]);

  const spentCents = spendWeek._sum.totalCents ?? 0;
  const prev = spendPrev._sum.totalCents ?? 0;
  const spentChangePct = prev > 0 ? Math.round(((spentCents - prev) / prev) * 100) : spentCents > 0 ? 100 : 0;

  const workedMinutes = timesheets.filter((t) => t.scheduledStart >= weekAgo).reduce((s, t) => s + t.billableMinutes, 0);

  const spendByDay = new Map<string, number>();
  for (const inv of invoices) spendByDay.set(dayKey(inv.createdAt), (spendByDay.get(dayKey(inv.createdAt)) ?? 0) + inv.totalCents);
  const hoursByDay = new Map<string, number>();
  for (const t of timesheets) hoursByDay.set(dayKey(t.scheduledStart), (hoursByDay.get(dayKey(t.scheduledStart)) ?? 0) + t.billableMinutes / 60);
  const series: EmployerDashboardStats["series"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY);
    const key = dayKey(d);
    series.push({ date: key, spentCents: Math.round(spendByDay.get(key) ?? 0), hours: Math.round(hoursByDay.get(key) ?? 0) });
  }

  const activity = [
    ...recentTs.filter((t) => t.approvedAt && t.freelancer?.user).map((t) => ({ at: t.approvedAt!.toISOString(), text: `Uren goedgekeurd — ${t.freelancer.user.fullName} bij ${t.branch?.name ?? "een vestiging"}` })),
    ...recentAssign.filter((a) => a.acceptedAt && a.freelancer?.user).map((a) => ({ at: a.acceptedAt.toISOString(), text: `${a.freelancer.user.fullName} ingepland voor ${a.shift?.title ?? "een klus"}` })),
  ]
    .sort((x, y) => (x.at < y.at ? 1 : -1))
    .slice(0, 8);

  return {
    spentCents,
    spentChangePct,
    workedHours: Math.round(workedMinutes / 60),
    activeWorkersToday: new Set(activeToday.map((a) => a.freelancerId)).size,
    fillRate: shiftsTotal > 0 ? Math.round((shiftsFilled / shiftsTotal) * 1000) / 1000 : 0,
    shiftsFilled,
    shiftsTotal,
    hoursToApprove: toApprove,
    series,
    activity,
  };
}
