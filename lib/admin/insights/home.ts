import { prisma } from "@/lib/prisma";
import { zonderTestklussen } from "@/lib/shifts/testklus-db";
import { echteAanmeldingen } from "@/lib/admin/weekcijfers";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { getTriage, type TriageItem } from "@/lib/admin/triage";
import { budgetSnapshot } from "@/lib/ai/governor";
import { listConversations } from "@/lib/chat/webchat";
import { cronHeartbeats } from "@/lib/ops/heartbeat";
import { listErrorGroups } from "@/lib/ops/error-journal";
import { getSettings as getAutopilotSettings } from "@/lib/autopilot/store";
import { overdueInvoices } from "@/lib/billing/reminders";
import { openExposureCents } from "@/lib/billing/clawback";
import { ownerTodos } from "@/lib/admin/owner-todos";
import { bucketCount, deltaPct, safe, timelineKeys, within, type Period } from "@/lib/admin/period";
import { euro, count, percentOf } from "@/lib/admin/format";
import { sumOf } from "@/lib/admin/insights/common";
import { ragChunkAantal } from "@/lib/rag/telling";
import type { Tone } from "@/components/admin/kit";

// ---------------------------------------------------------------------------
// De cijfers van het Controlecentrum (sinds 21 nov 2026 alleen het flexwerk-platform:
// werkers, bedrijven, klussen, reacties, uren, facturen, fouten en taken), en per
// onderdeel van de beheeromgeving een tegel met wat daar nu speelt. Elk cijfer komt
// uit de database of de KV-opslag en mag apart mislukken: dan staat er een streepje
// of een nul in plaats van een kapotte pagina. Alleen goedkope tellingen, geen
// zware vragen.
// ---------------------------------------------------------------------------

export interface HubMetric {
  label: string;
  value: string;
  tone?: Tone;
}

export interface Telling {
  total: number;
  delta: number | null;
}

export interface HomeInsights {
  labels: string[];
  /** Echte aanmeldingen (zonder test- en eigen accounts) in de periode. */
  signups: Telling & { series: number[] };
  /** Nieuwe bedrijven (tenants, niet het platform zelf) in de periode. */
  bedrijven: Telling;
  /** Klussen die nog mensen zoeken en nog moeten beginnen. */
  openKlussen: { total: number; binnenkort: number };
  /** Reacties van werkers op klussen in de periode. */
  reacties: Telling;
  /** Ingediende uren die op goedkeuring wachten. */
  urenTeKeuren: number;
  /** Openstaande facturen aan bedrijven: bedrag, aantal en wat te laat is. */
  facturen: { openCents: number; openCount: number; teLaatCents: number };
  /** Foutgroepen die de laatste 24 uur nog voorkwamen; null als het logboek niet te lezen was. */
  fouten: number | null;
  /** Open taken voor de eigenaar; null als de lijst te lang op zich liet wachten. */
  todos: number | null;
  triage: TriageItem[];
  urgent: number;
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
];

const ACTIVITY_TEXT: Record<string, string> = {
  "auth.register": "Nieuwe aanmelding op het platform",
  "agreement.signed.client": "Modelovereenkomst ondertekend door opdrachtgever",
  "agreement.signed.freelancer": "Modelovereenkomst ondertekend door flexwerker",
  "company.verified": "Nieuw bedrijf geverifieerd",
};

const DAG = 86_400_000;
const ZOEKT_MENSEN = ["OPEN", "MATCHING", "PARTIALLY_FILLED"] as const;

export async function homeInsights(period: Period): Promise<HomeInsights> {
  const { from, prevFrom, to } = period;
  // klussen in tellingen: alleen echte vraag, geen testklussen
  const zonderTest = await zonderTestklussen(prevFrom);
  const [
    signups,
    bedrijvenNu,
    bedrijvenVorig,
    openKlussen,
    binnenkort,
    reactiesNu,
    reactiesVorig,
    urenTeKeuren,
    openInvoices,
    overdue,
    exposure,
    fouten,
    todos,
    triage,
    activity,
    usersTotal,
    companies,
    kycPending,
    conversations,
    budget,
    ragChunks,
    autopilot,
    openDisputes,
    failedPayments,
    crons,
    upcomingShifts,
  ] = await Promise.all([
    // aanmeldingen zonder test- en eigen accounts (lib/admin/echt-kern.ts), zoals de weekcijfers
    safe(async () => echteAanmeldingen(prevFrom, await leesEigenTest().catch(() => null)), []),
    safe(() => prisma.tenant.count({ where: { type: { not: "PLATFORM" }, createdAt: { gte: from, lt: to } } }), 0),
    safe(() => prisma.tenant.count({ where: { type: { not: "PLATFORM" }, createdAt: { gte: prevFrom, lt: from } } }), 0),
    safe(() => prisma.shift.count({ where: { status: { in: [...ZOEKT_MENSEN] }, startsAt: { gte: to }, ...zonderTest } }), 0),
    safe(() => prisma.shift.count({ where: { status: { in: [...ZOEKT_MENSEN] }, startsAt: { gte: to, lt: new Date(to.getTime() + 2 * DAG) }, ...zonderTest } }), 0),
    // een reactie = de werker nam de klus aan (applyToShift → recordOfferResponse in lib/notifications/dispatcher.ts zet ACCEPTED met respondedAt)
    safe(() => prisma.shiftMatch.count({ where: { status: "ACCEPTED", respondedAt: { gte: from, lt: to } } }), 0),
    safe(() => prisma.shiftMatch.count({ where: { status: "ACCEPTED", respondedAt: { gte: prevFrom, lt: from } } }), 0),
    safe(() => prisma.timesheet.count({ where: { status: "SUBMITTED" } }), 0),
    safe(() => prisma.invoice.aggregate({ where: { status: "ISSUED", recipientTenantId: { not: null } }, _sum: { totalCents: true }, _count: true }), null),
    safe(() => overdueInvoices(), []),
    safe(() => openExposureCents(), 0),
    // het foutenlogboek staat in de KV-opslag; duurt het te lang, dan een streepje
    within(listErrorGroups(400), 1500),
    // deze lijst vraagt ook externe diensten: de pagina wacht er niet langer dan even op
    within(ownerTodos(), 1500),
    safe(() => getTriage(), []),
    safe(() => prisma.auditLog.findMany({ where: { action: { in: ACTIVITY_ACTIONS } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, summary: true, severity: true, createdAt: true } }), []),
    safe(() => prisma.user.count(), 0),
    safe(() => prisma.tenant.count({ where: { type: { not: "PLATFORM" } } }), 0),
    safe(() => prisma.user.count({ where: { kycStatus: "PENDING" } }), 0),
    safe(() => listConversations("all", 200), []),
    safe(() => budgetSnapshot(), null),
    safe(() => ragChunkAantal(), 0),
    safe(() => getAutopilotSettings(), null),
    safe(() => prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } } }), 0),
    safe(() => prisma.payment.count({ where: { status: { in: ["FAILED", "RETURNED"] } } }), 0),
    safe(() => cronHeartbeats(), []),
    safe(() => prisma.shift.count({ where: { startsAt: { gte: to, lt: new Date(to.getTime() + 7 * DAG) }, status: { not: "CANCELLED" }, ...zonderTest } }), 0),
  ]);

  const signupsNow = signups.filter((u) => u.createdAt >= from).length;
  const signupsPrev = signups.filter((u) => u.createdAt < from).length;
  const overdueCents = sumOf(overdue, (i) => i.totalCents);
  const staleCrons = crons.filter((c) => c.stale).length;
  const needHuman = conversations.filter((c) => c.status === "human").length;
  const unread = sumOf(conversations, (c) => c.unread ?? 0);
  const budgetPct = budget?.tokenBudget ? percentOf(budget.tokensUsed, budget.tokenBudget) : 0;
  const todosOpen = todos?.filter((t) => !t.done).length ?? null;
  const sinds24u = new Date(to.getTime() - DAG).toISOString();
  const fouten24u = fouten === null ? null : fouten.filter((g) => g.lastAt >= sinds24u).length;
  const warn = (n: number): { tone?: Tone } => (n > 0 ? { tone: "warn" } : {});

  return {
    labels: timelineKeys(period),
    signups: { total: signupsNow, delta: deltaPct(signupsNow, signupsPrev), series: bucketCount(signups, (u) => u.createdAt, period) },
    bedrijven: { total: bedrijvenNu, delta: deltaPct(bedrijvenNu, bedrijvenVorig) },
    openKlussen: { total: openKlussen, binnenkort },
    reacties: { total: reactiesNu, delta: deltaPct(reactiesNu, reactiesVorig) },
    urenTeKeuren,
    facturen: { openCents: openInvoices?._sum.totalCents ?? 0, openCount: openInvoices?._count ?? 0, teLaatCents: overdueCents },
    fouten: fouten24u,
    todos: todosOpen,
    triage,
    urgent: triage.filter((t) => t.severity === "high").length,
    activity: activity.map((a) => ({ key: a.id, text: ACTIVITY_TEXT[a.action] ?? a.summary.slice(0, 110), at: a.createdAt, severity: a.severity })),
    hubs: {
      overzicht: {
        metrics: [
          { label: "Klussen 7 dagen", value: count(upcomingShifts) },
          { label: "Nog niet vol", value: count(binnenkort), ...warn(binnenkort) },
          { label: "Jouw taken", value: todosOpen === null ? "—" : count(todosOpen) },
        ],
      },
      mensen: {
        metrics: [
          { label: "Gebruikers", value: count(usersTotal) },
          { label: "Bedrijven", value: count(companies) },
          { label: "Te keuren", value: count(kycPending), ...warn(kycPending) },
        ],
        spark: bucketCount(signups, (u) => u.createdAt, period),
      },
      klussen: {
        metrics: [
          { label: "Zoeken mensen", value: count(openKlussen) },
          { label: "Uren te keuren", value: count(urenTeKeuren), ...warn(urenTeKeuren) },
          { label: "Open disputen", value: count(openDisputes), ...warn(openDisputes) },
        ],
      },
      geld: {
        metrics: [
          { label: "Open facturen", value: euro(openInvoices?._sum.totalCents ?? 0) },
          { label: "Te laat", value: euro(overdueCents), ...warn(overdueCents) },
          { label: "Voorgeschoten", value: euro(exposure), ...(exposure > 0 ? { tone: "crit" as const } : {}) },
        ],
      },
      communicatie: {
        metrics: [
          { label: "Website-chats", value: count(conversations.length) },
          { label: "Wil een mens", value: count(needHuman), ...warn(needHuman) },
          { label: "Ongelezen", value: count(unread), ...warn(unread) },
        ],
      },
      ai: {
        metrics: [
          { label: "AI-budget", value: `${budgetPct}%`, ...(budgetPct > 90 ? { tone: "warn" as const } : {}) },
          { label: "Kennis", value: count(ragChunks) },
          { label: "Autopilot", value: autopilot?.enabled ? "Aan" : "Uit", tone: autopilot?.enabled ? "ok" : "neutral" },
        ],
      },
      systeem: {
        metrics: [
          { label: "Fouten 24 uur", value: fouten24u === null ? "—" : count(fouten24u), ...warn(fouten24u ?? 0) },
          { label: "Mislukt", value: count(failedPayments), ...(failedPayments > 0 ? { tone: "crit" as const } : {}) },
          { label: "Taken te laat", value: count(staleCrons), ...warn(staleCrons) },
        ],
      },
    },
  };
}
