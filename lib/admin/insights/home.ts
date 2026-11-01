import { prisma } from "@/lib/prisma";
import { financeOverview } from "@/lib/admin/finance";
import { getTriage, type TriageItem } from "@/lib/admin/triage";
import { allFunnelReports, type FunnelReport } from "@/lib/analytics/funnel";
import { budgetSnapshot } from "@/lib/ai/governor";
import { listCalls } from "@/lib/telephony/store";
import { listConversations } from "@/lib/chat/webchat";
import { cronHeartbeats } from "@/lib/ops/heartbeat";
import { getSettings as getAutopilotSettings } from "@/lib/autopilot/store";
import { overdueInvoices } from "@/lib/billing/reminders";
import { openExposureCents } from "@/lib/billing/clawback";
import { ownerTodos } from "@/lib/admin/owner-todos";
import { bucketCount, bucketSum, deltaPct, safe, timelineKeys, within, type Period } from "@/lib/admin/period";
import { euro, count, percentOf } from "@/lib/admin/format";
import { moneyRows, sumOf, visitorSeries } from "@/lib/admin/insights/common";
import type { Tone } from "@/components/admin/kit";

// ---------------------------------------------------------------------------
// De cijfers van het Controlecentrum, en per onderdeel van de beheeromgeving een
// tegel met wat daar nu speelt. Elk cijfer komt uit de database of de KV-opslag en
// mag apart mislukken: dan staat er een streepje in plaats van een kapotte pagina.
// ---------------------------------------------------------------------------

export interface HubMetric {
  label: string;
  value: string;
  tone?: Tone;
}

export interface HomeInsights {
  labels: string[];
  revenue: { total: number; delta: number | null; series: number[] };
  gross: { total: number; delta: number | null };
  hours: { total: number; delta: number | null; series: number[] };
  fill: { pct: number; filled: number; total: number; delta: number | null };
  signups: { total: number; delta: number | null; series: number[] };
  visitors: { total: number; delta: number | null; series: number[] };
  triage: TriageItem[];
  urgent: number;
  funnels: FunnelReport[];
  activity: { key: string; text: string; at: Date; severity: string }[];
  hubs: Record<string, { metrics: HubMetric[]; spark?: number[] }>;
}

const ACTIVITY_ACTIONS = [
  "auth.register",
  "company.verified",
  "timesheet.approved",
  "agreement.signed.client",
  "agreement.signed.freelancer",
  "invoice.paid",
  "invoice.reversed",
  "payout.settled",
  "shop.order.paid",
  "telephony.call.placed",
  "website.subscription.active",
  "website.subscription.cancelled",
];

const ACTIVITY_TEXT: Record<string, string> = {
  "auth.register": "Nieuwe aanmelding op het platform",
  "agreement.signed.client": "Modelovereenkomst ondertekend door opdrachtgever",
  "agreement.signed.freelancer": "Modelovereenkomst ondertekend door flexwerker",
  "company.verified": "Nieuw bedrijf geverifieerd",
};

export async function homeInsights(period: Period): Promise<HomeInsights> {
  const { from, prevFrom, to } = period;
  const [
    finance,
    financePrev,
    money,
    hours,
    shiftsNow,
    filledNow,
    shiftsPrev,
    filledPrev,
    signups,
    visitors,
    triage,
    funnels,
    activity,
    usersTotal,
    companies,
    kycPending,
    overdue,
    openInvoices,
    exposure,
    openLeads,
    calls,
    orders,
    lowStock,
    conversations,
    budget,
    ragChunks,
    autopilot,
    openDisputes,
    failedPayments,
    crons,
    upcomingShifts,
    unfilledSoon,
    todos,
  ] = await Promise.all([
    safe(() => financeOverview(from, to), null),
    safe(() => financeOverview(prevFrom, from), null),
    moneyRows(prevFrom, to),
    safe(() => prisma.timesheet.findMany({ where: { status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: prevFrom, lt: to } }, select: { billableMinutes: true, scheduledStart: true }, take: 50_000 }), []),
    safe(() => prisma.shift.count({ where: { startsAt: { gte: from, lt: to }, status: { not: "CANCELLED" } } }), 0),
    safe(() => prisma.shift.count({ where: { startsAt: { gte: from, lt: to }, status: { not: "CANCELLED" }, assignments: { some: { cancelledAt: null } } } }), 0),
    safe(() => prisma.shift.count({ where: { startsAt: { gte: prevFrom, lt: from }, status: { not: "CANCELLED" } } }), 0),
    safe(() => prisma.shift.count({ where: { startsAt: { gte: prevFrom, lt: from }, status: { not: "CANCELLED" }, assignments: { some: { cancelledAt: null } } } }), 0),
    safe(() => prisma.user.findMany({ where: { createdAt: { gte: prevFrom } }, select: { createdAt: true }, take: 50_000 }), []),
    visitorSeries(period),
    safe(() => getTriage(), []),
    safe(() => allFunnelReports(period.days > 90 ? 12 : 3), []),
    safe(() => prisma.auditLog.findMany({ where: { action: { in: ACTIVITY_ACTIONS } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, summary: true, severity: true, createdAt: true } }), []),
    safe(() => prisma.user.count(), 0),
    safe(() => prisma.tenant.count({ where: { type: { not: "PLATFORM" } } }), 0),
    safe(() => prisma.user.count({ where: { kycStatus: "PENDING" } }), 0),
    safe(() => overdueInvoices(), []),
    safe(() => prisma.invoice.aggregate({ where: { status: "ISSUED", recipientTenantId: { not: null } }, _sum: { totalCents: true }, _count: true }), null),
    safe(() => openExposureCents(), 0),
    safe(() => prisma.salesLead.count({ where: { status: { notIn: ["WON", "LOST", "DISQUALIFIED", "BOUNCED", "UNSUBSCRIBED"] } } }), 0),
    safe(() => listCalls(500), []),
    safe(() => prisma.shopOrder.findMany({ where: { status: { in: ["RECEIVED", "CONFIRMED", "SHIPPED"] }, createdAt: { gte: from } }, select: { totalCents: true, status: true }, take: 10_000 }), []),
    safe(() => prisma.shopProductVariant.count({ where: { stock: { lte: 5 }, product: { active: true } } }), 0),
    safe(() => listConversations("all", 200), []),
    safe(() => budgetSnapshot(), null),
    safe(() => prisma.ragChunk.count(), 0),
    safe(() => getAutopilotSettings(), null),
    safe(() => prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } } }), 0),
    safe(() => prisma.payment.count({ where: { status: { in: ["FAILED", "RETURNED"] } } }), 0),
    safe(() => cronHeartbeats(), []),
    safe(() => prisma.shift.count({ where: { startsAt: { gte: to, lt: new Date(to.getTime() + 7 * 86_400_000) }, status: { not: "CANCELLED" } } }), 0),
    safe(() => prisma.shift.count({ where: { startsAt: { gte: to, lt: new Date(to.getTime() + 2 * 86_400_000) }, status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] } } }), 0),
    // Deze lijst vraagt ook externe diensten: de pagina wacht er niet langer dan even op.
    within(ownerTodos(), 1500),
  ]);

  const inPeriod = <T,>(rows: readonly T[], at: (row: T) => Date) => rows.filter((row) => at(row) >= from);
  const before = <T,>(rows: readonly T[], at: (row: T) => Date) => rows.filter((row) => at(row) < from);

  const grossNow = sumOf(inPeriod(money, (r) => r.at), (r) => r.grossCents);
  const grossPrev = sumOf(before(money, (r) => r.at), (r) => r.grossCents);
  const revenueTotal = finance?.revenue.total ?? sumOf(inPeriod(money, (r) => r.at), (r) => r.marginCents);
  const revenuePrev = financePrev?.revenue.total ?? sumOf(before(money, (r) => r.at), (r) => r.marginCents);
  const hoursNow = sumOf(inPeriod(hours, (t) => t.scheduledStart), (t) => t.billableMinutes) / 60;
  const hoursPrev = sumOf(before(hours, (t) => t.scheduledStart), (t) => t.billableMinutes) / 60;
  const signupsNow = inPeriod(signups, (u) => u.createdAt).length;
  const signupsPrev = before(signups, (u) => u.createdAt).length;
  const fillPct = percentOf(filledNow, shiftsNow);
  const fillPrevPct = percentOf(filledPrev, shiftsPrev);

  const overdueCents = sumOf(overdue, (i) => i.totalCents);
  const staleCrons = crons.filter((c) => c.stale).length;
  const needHuman = conversations.filter((c) => c.status === "human").length;
  const unread = sumOf(conversations, (c) => c.unread);
  const callsNow = calls.filter((c) => new Date(c.at) >= from);
  const interested = callsNow.filter((c) => c.outcome?.interested).length;
  const shopCents = sumOf(orders, (o) => o.totalCents);
  const budgetPct = budget?.tokenBudget ? percentOf(budget.tokensUsed, budget.tokenBudget) : 0;
  const todosOpen = todos?.filter((t) => !t.done).length ?? null;

  return {
    labels: timelineKeys(period),
    revenue: { total: revenueTotal, delta: deltaPct(revenueTotal, revenuePrev), series: bucketSum(money, (r) => r.at, (r) => r.marginCents, period) },
    gross: { total: grossNow, delta: deltaPct(grossNow, grossPrev) },
    hours: { total: hoursNow, delta: deltaPct(hoursNow, hoursPrev), series: bucketSum(hours, (t) => t.scheduledStart, (t) => t.billableMinutes / 60, period).map((h) => Math.round(h * 10) / 10) },
    fill: { pct: fillPct, filled: filledNow, total: shiftsNow, delta: shiftsPrev > 0 ? fillPct - fillPrevPct : null },
    signups: { total: signupsNow, delta: deltaPct(signupsNow, signupsPrev), series: bucketCount(signups, (u) => u.createdAt, period) },
    visitors: { total: visitors.total, delta: deltaPct(visitors.total, visitors.previous), series: visitors.series },
    triage,
    urgent: triage.filter((t) => t.severity === "high").length,
    funnels,
    activity: activity.map((a) => ({ key: a.id, text: ACTIVITY_TEXT[a.action] ?? a.summary.slice(0, 110), at: a.createdAt, severity: a.severity })),
    hubs: {
      overzicht: {
        metrics: [
          { label: "Klussen 7 dagen", value: count(upcomingShifts) },
          { label: "Nog niet vol", value: count(unfilledSoon), ...(unfilledSoon > 0 ? { tone: "warn" as const } : {}) },
          { label: "Jouw taken", value: todosOpen === null ? "—" : count(todosOpen) },
        ],
      },
      mensen: {
        metrics: [
          { label: "Gebruikers", value: count(usersTotal) },
          { label: "Bedrijven", value: count(companies) },
          { label: "Te keuren", value: count(kycPending), ...(kycPending > 0 ? { tone: "warn" as const } : {}) },
        ],
        spark: bucketCount(signups, (u) => u.createdAt, period),
      },
      geld: {
        metrics: [
          { label: "Open facturen", value: euro(openInvoices?._sum.totalCents ?? 0) },
          { label: "Te laat", value: euro(overdueCents), ...(overdueCents > 0 ? { tone: "warn" as const } : {}) },
          { label: "Voorgeschoten", value: euro(exposure), ...(exposure > 0 ? { tone: "crit" as const } : {}) },
        ],
        spark: bucketSum(money, (r) => r.at, (r) => r.marginCents, period),
      },
      groei: {
        metrics: [
          { label: "Open leads", value: count(openLeads) },
          { label: "Gesprekken", value: count(callsNow.length) },
          { label: "Met interesse", value: count(interested), ...(interested > 0 ? { tone: "ok" as const } : {}) },
        ],
        spark: visitors.series,
      },
      communicatie: {
        metrics: [
          { label: "Website-chats", value: count(conversations.length) },
          { label: "Wil een mens", value: count(needHuman), ...(needHuman > 0 ? { tone: "warn" as const } : {}) },
          { label: "Ongelezen", value: count(unread), ...(unread > 0 ? { tone: "warn" as const } : {}) },
        ],
      },
      merk: {
        metrics: [
          { label: "Bestellingen", value: count(orders.length) },
          { label: "Omzet webshop", value: euro(shopCents) },
          { label: "Bijna op", value: count(lowStock), ...(lowStock > 0 ? { tone: "warn" as const } : {}) },
        ],
      },
      ai: {
        metrics: [
          { label: "AI-budget", value: `${budgetPct}%`, ...(budgetPct > 90 ? { tone: "warn" as const } : {}) },
          { label: "Kennis", value: count(ragChunks) },
          { label: "Autopilot", value: autopilot?.enabled ? "Aan" : "Uit", tone: autopilot?.enabled ? "ok" : "neutral" },
        ],
      },
      veiligheid: {
        metrics: [
          { label: "Open disputen", value: count(openDisputes), ...(openDisputes > 0 ? { tone: "warn" as const } : {}) },
          { label: "Mislukt", value: count(failedPayments), ...(failedPayments > 0 ? { tone: "crit" as const } : {}) },
          { label: "Taken te laat", value: count(staleCrons), ...(staleCrons > 0 ? { tone: "warn" as const } : {}) },
        ],
      },
    },
  };
}
