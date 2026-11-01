import { prisma } from "@/lib/prisma";
import { bucketSum, resolvePeriod, safe, timelineKeys } from "@/lib/admin/period";

// De cijfers op de detailpagina's: één flexwerker of één bedrijf, de laatste 12 maanden.

/** Wat een flexwerker gedaan en verdiend heeft: uren per maand en totalen. */
export async function freelancerActivity(freelancerId: string) {
  const period = resolvePeriod("365");
  const [sheets, assignments, cancelled] = await Promise.all([
    safe(
      () =>
        prisma.timesheet.findMany({
          where: { freelancerId, status: { in: ["APPROVED", "PAID"] } },
          select: { billableMinutes: true, hourlyRateCents: true, approvedAt: true, scheduledStart: true },
          take: 5000,
        }),
      [],
    ),
    safe(() => prisma.shiftAssignment.count({ where: { freelancerId, cancelledAt: null } }), 0),
    safe(() => prisma.shiftAssignment.count({ where: { freelancerId, cancelledAt: { not: null } } }), 0),
  ]);
  const hoursOf = (s: { billableMinutes: number }) => s.billableMinutes / 60;
  return {
    labels: timelineKeys(period),
    hoursSeries: bucketSum(sheets, (s) => s.approvedAt ?? s.scheduledStart, hoursOf, period),
    totalHours: sheets.reduce((sum, s) => sum + hoursOf(s), 0),
    earnedCents: sheets.reduce((sum, s) => sum + Math.round(hoursOf(s) * s.hourlyRateCents), 0),
    assignments,
    cancelled,
  };
}

/** Facturen en klussen van één bedrijf. */
export async function companyActivity(tenantId: string) {
  const period = resolvePeriod("365");
  const [invoices, shifts, hours] = await Promise.all([
    safe(
      () =>
        prisma.invoice.findMany({
          where: { recipientTenantId: tenantId, status: { in: ["PAID", "ISSUED"] } },
          select: { id: true, number: true, type: true, status: true, totalCents: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 2000,
        }),
      [],
    ),
    safe(
      () =>
        prisma.shift.findMany({
          where: { branch: { tenantId } },
          select: { id: true, title: true, startsAt: true, positions: true, status: true, branch: { select: { name: true } }, assignments: { where: { cancelledAt: null }, select: { id: true } } },
          orderBy: { startsAt: "desc" },
          take: 500,
        }),
      [],
    ),
    safe(() => prisma.timesheet.aggregate({ where: { branch: { tenantId }, status: { in: ["APPROVED", "PAID"] } }, _sum: { billableMinutes: true } }), { _sum: { billableMinutes: 0 } }),
  ]);
  const paid = invoices.filter((i) => i.status === "PAID");
  const open = invoices.filter((i) => i.status === "ISSUED");
  const sum = (rows: { totalCents: number }[]) => rows.reduce((s, r) => s + r.totalCents, 0);
  const positions = shifts.reduce((n, s) => n + Math.max(0, s.positions), 0);
  const filled = shifts.reduce((n, s) => n + Math.min(s.assignments.length, Math.max(0, s.positions)), 0);
  return {
    labels: timelineKeys(period),
    paidSeries: bucketSum(paid, (i) => i.createdAt, (i) => i.totalCents, period),
    openSeries: bucketSum(open, (i) => i.createdAt, (i) => i.totalCents, period),
    paidCents: sum(paid),
    paidCount: paid.length,
    openCents: sum(open),
    openCount: open.length,
    invoices: invoices.slice(0, 200),
    shifts: shifts.slice(0, 200),
    shiftCount: shifts.length,
    positions,
    filled,
    hours: (hours._sum.billableMinutes ?? 0) / 60,
  };
}
