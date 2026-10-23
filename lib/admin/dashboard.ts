import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Shopify-stijl dashboard-cijfers voor het admin-controlecentrum. Echte data:
// 4 KPI's (omzet + WoW, gewerkte uren + actieve flexwerkers, vervullingsgraad,
// DBA-compliance), een 30-daagse reeks (omzet & uren) en een live
// activiteitenfeed. Alles best-effort met bounded queries.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export interface DashboardStats {
  grossVolumeCents: number; // laatste 7 dagen
  grossVolumeChangePct: number; // t.o.v. de 7 dagen daarvoor
  workedHours: number; // laatste 7 dagen
  activeFreelancersToday: number;
  fulfillmentRate: number; // 0..1, laatste 30 dagen
  shiftsFilled: number;
  shiftsTotal: number;
  dbaRiskFlags: number;
  compliancePct: number;
  series: { date: string; revenueCents: number; hours: number }[];
  activity: { at: string; kind: string; text: string }[];
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function dashboardStats(now = new Date()): Promise<DashboardStats> {
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [revWeek, revPrevWeek, paidInvoices, timesheets, shiftsAgg, shiftsFilledAgg, activeToday, dbaFlags, audit] = await Promise.all([
    safe(() => prisma.invoice.aggregate({ where: { status: "PAID", createdAt: { gte: weekAgo } }, _sum: { totalCents: true } }), { _sum: { totalCents: null } }),
    safe(() => prisma.invoice.aggregate({ where: { status: "PAID", createdAt: { gte: twoWeeksAgo, lt: weekAgo } }, _sum: { totalCents: true } }), { _sum: { totalCents: null } }),
    safe(() => prisma.invoice.findMany({ where: { status: "PAID", createdAt: { gte: monthAgo } }, select: { totalCents: true, createdAt: true }, take: 20_000 }), [] as { totalCents: number; createdAt: Date }[]),
    safe(
      () => prisma.timesheet.findMany({ where: { status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: monthAgo } }, select: { billableMinutes: true, scheduledStart: true }, take: 50_000 }),
      [] as { billableMinutes: number; scheduledStart: Date }[],
    ),
    safe(() => prisma.shift.count({ where: { startsAt: { gte: monthAgo, lt: now } } }), 0),
    safe(() => prisma.shift.count({ where: { startsAt: { gte: monthAgo, lt: now }, status: "FILLED" } }), 0),
    safe(() => prisma.shiftAssignment.findMany({ where: { cancelledAt: null, shift: { startsAt: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY) } } }, select: { freelancerId: true }, take: 5000 }), [] as { freelancerId: string }[]),
    safe(() => prisma.freelancerProfile.count({ where: { matchingBlockedUntil: { gt: now } } }), 0),
    safe(
      () => prisma.auditLog.findMany({ where: { action: { in: ["timesheet.approved", "agreement.signed.client", "agreement.signed.freelancer", "company.verified", "auth.register", "payout.settled"] } }, orderBy: { seq: "desc" }, take: 12, select: { action: true, summary: true, createdAt: true } }),
      [] as { action: string; summary: string; createdAt: Date }[],
    ),
  ]);

  const grossVolumeCents = revWeek._sum.totalCents ?? 0;
  const prev = revPrevWeek._sum.totalCents ?? 0;
  const grossVolumeChangePct = prev > 0 ? Math.round(((grossVolumeCents - prev) / prev) * 100) : grossVolumeCents > 0 ? 100 : 0;

  // 7-day worked hours
  const workedMinutes = timesheets.filter((t) => t.scheduledStart >= weekAgo).reduce((s, t) => s + t.billableMinutes, 0);
  const workedHours = Math.round(workedMinutes / 60);

  // 30-day daily series (revenue + hours)
  const revByDay = new Map<string, number>();
  for (const inv of paidInvoices) revByDay.set(dayKey(inv.createdAt), (revByDay.get(dayKey(inv.createdAt)) ?? 0) + inv.totalCents);
  const hoursByDay = new Map<string, number>();
  for (const t of timesheets) hoursByDay.set(dayKey(t.scheduledStart), (hoursByDay.get(dayKey(t.scheduledStart)) ?? 0) + t.billableMinutes / 60);
  const series: DashboardStats["series"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY);
    const key = dayKey(d);
    series.push({ date: key, revenueCents: Math.round(revByDay.get(key) ?? 0), hours: Math.round(hoursByDay.get(key) ?? 0) });
  }

  const fulfillmentRate = shiftsAgg > 0 ? shiftsFilledAgg / shiftsAgg : 0;
  const openCompliance = dbaFlags; // DBA-blocked freelancers = active risk flags
  const compliancePct = openCompliance === 0 ? 100 : Math.max(0, Math.round((1 - openCompliance / Math.max(10, shiftsAgg)) * 100));

  const activity: DashboardStats["activity"] = audit.map((a) => ({ at: a.createdAt.toISOString(), kind: a.action, text: friendlyActivity(a.action, a.summary) }));

  return {
    grossVolumeCents,
    grossVolumeChangePct,
    workedHours,
    activeFreelancersToday: new Set(activeToday.map((a) => a.freelancerId)).size,
    fulfillmentRate: Math.round(fulfillmentRate * 1000) / 1000,
    shiftsFilled: shiftsFilledAgg,
    shiftsTotal: shiftsAgg,
    dbaRiskFlags: dbaFlags,
    compliancePct,
    series,
    activity,
  };
}

function friendlyActivity(action: string, summary: string): string {
  switch (action) {
    case "timesheet.approved":
      return summary.replace(/^.*?:\s*/, "Uren goedgekeurd — ") || "Uren goedgekeurd";
    case "agreement.signed.client":
    case "agreement.signed.freelancer":
      return "Modelovereenkomst digitaal ondertekend (Wet DBA)";
    case "company.verified":
      return "Nieuw bedrijf geverifieerd";
    case "auth.register":
      return "Nieuwe aanmelding op het platform";
    case "payout.settled":
      return "Automatische uitbetaling voltooid (SEPA)";
    default:
      return summary.slice(0, 120);
  }
}
