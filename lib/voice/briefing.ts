import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { chat } from "@/lib/ai/client";
import { announce } from "@/lib/voice/announce";
import { budgetSnapshot } from "@/lib/ai/governor";
import { liveTraffic } from "@/lib/analytics/report";
import type { StartupReport } from "@/lib/config/startup";

// ---------------------------------------------------------------------------
// Proactive spoken briefing. Pulls LIVE numbers from the database (no stub
// data), composes a Dutch update and queues it for the voice agent.
// ---------------------------------------------------------------------------

const MONTH_START = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

export interface BriefingData {
  activeUsers: number;
  freelancers: number;
  openShifts: number;
  timesheetsToApprove: number;
  openDisputes: number;
  revenueThisMonthCents: number;
  paidPayoutsThisMonthCents: number;
  newLeads: number;
  outreachAwaitingApproval: number;
  openFindings: { severity: string; count: number }[];
  agentActivity: { agent: string; lastTitle: string; at: string }[];
  aiTokensToday: number;
  aiTokenBudget: number;
  visitorsToday: number;
  activeVisitors: number;
}

export async function gatherBriefingData(): Promise<BriefingData> {
  const monthStart = MONTH_START();
  const [
    activeUsers,
    freelancers,
    openShifts,
    timesheetsToApprove,
    openDisputes,
    invoiceAgg,
    payoutAgg,
    newLeads,
    outreachAwaitingApproval,
    findings,
    events,
    budget,
    traffic,
  ] = await Promise.all([
    prisma.user.count({ where: { disabledAt: null } }),
    prisma.freelancerProfile.count(),
    prisma.shift.count({ where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] } } }),
    prisma.timesheet.count({ where: { status: { in: ["SUBMITTED", "DISPUTED"] } } }),
    prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    prisma.invoice.aggregate({
      _sum: { totalCents: true },
      where: { type: "SELF_BILL_FREELANCER", createdAt: { gte: monthStart } },
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: { status: "SETTLED", createdAt: { gte: monthStart } },
    }),
    prisma.salesLead.count({ where: { status: "NEW" } }),
    prisma.salesOutreach.count({ where: { status: "DRAFT" } }),
    prisma.orchestrationFinding.groupBy({
      by: ["severity"],
      _count: { _all: true },
      where: { status: "OPEN" },
    }),
    prisma.jarvisEvent.findMany({
      where: { kind: { in: ["AGENT_DELEGATION", "TOOL_CALL"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { agent: true, title: true, createdAt: true },
    }),
    budgetSnapshot().catch(() => null),
    liveTraffic().catch(() => null),
  ]);

  const seen = new Set<string>();
  const agentActivity = events
    .filter((e) => (seen.has(e.agent) ? false : (seen.add(e.agent), true)))
    .slice(0, 4)
    .map((e) => ({ agent: e.agent, lastTitle: e.title, at: e.createdAt.toISOString() }));

  return {
    activeUsers,
    freelancers,
    openShifts,
    timesheetsToApprove,
    openDisputes,
    revenueThisMonthCents: invoiceAgg._sum.totalCents ?? 0,
    paidPayoutsThisMonthCents: payoutAgg._sum.amountCents ?? 0,
    newLeads,
    outreachAwaitingApproval,
    openFindings: findings.map((f) => ({ severity: f.severity, count: f._count._all })),
    agentActivity,
    aiTokensToday: budget?.tokensUsed ?? 0,
    aiTokenBudget: budget?.tokenBudget ?? 0,
    visitorsToday: traffic?.visitorsToday ?? 0,
    activeVisitors: traffic?.activeVisitors ?? 0,
  };
}

function euro(cents: number): string {
  return `${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} euro`;
}

export function composeBriefingText(d: BriefingData): string {
  const parts: string[] = [];
  parts.push(
    `Statusupdate. ${d.activeUsers} actieve gebruikers, ${d.freelancers} flexwerkers, ${d.openShifts} open shifts.`,
  );
  if (d.visitorsToday > 0) {
    parts.push(
      `${d.visitorsToday} bezoekers vandaag, ${d.activeVisitors} nu actief op de site.`,
    );
  }
  if (d.timesheetsToApprove > 0) {
    parts.push(`${d.timesheetsToApprove} urenbriefjes wachten op goedkeuring.`);
  }
  if (d.openDisputes > 0) parts.push(`${d.openDisputes} open geschillen.`);
  parts.push(
    `Omzet deze maand ${euro(d.revenueThisMonthCents)}, uitbetaald ${euro(d.paidPayoutsThisMonthCents)}.`,
  );
  if (d.newLeads > 0 || d.outreachAwaitingApproval > 0) {
    parts.push(
      `Sales: ${d.newLeads} nieuwe leads, ${d.outreachAwaitingApproval} concepten wachten op goedkeuring.`,
    );
  }
  const highish = d.openFindings.filter((f) => ["HIGH", "CRITICAL"].includes(f.severity));
  if (highish.length > 0) {
    parts.push(
      `Let op: ${highish.reduce((a, f) => a + f.count, 0)} openstaande bevindingen met hoge prioriteit.`,
    );
  }
  for (const a of d.agentActivity) {
    parts.push(`Agent ${a.agent} werkte laatst aan: ${a.lastTitle}.`);
  }
  if (d.aiTokenBudget > 0) {
    parts.push(
      `AI-verbruik vandaag ${d.aiTokensToday} van ${d.aiTokenBudget} tokens.`,
    );
  }
  return parts.join(" ");
}

const BRIEF_SYSTEM =
  "Herschrijf deze statusupdate tot een vloeiende, natuurlijke Nederlandse spreektekst voor een spraakassistent. " +
  "Behoud ALLE cijfers en namen exact. Geen opmaak, geen aanhalingstekens. Maximaal 90 woorden.";

export async function speakBriefing(opts: { rephrase?: boolean } = {}): Promise<{
  text: string;
  announced: boolean;
}> {
  const data = await gatherBriefingData();
  let text = composeBriefingText(data);

  if (opts.rephrase !== false) {
    try {
      const r = await chat({
        purpose: "voice-briefing",
        messages: [
          { role: "system", content: BRIEF_SYSTEM },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        maxTokens: 220,
      });
      const spoken = r.text.replace(/["\n]+/g, " ").trim();
      if (spoken.length > 20) text = spoken;
    } catch (err) {
      logger.warn("briefing rephrase skipped", { error: (err as Error).message });
    }
  }

  const row = await announce({
    text,
    category: "status",
    priority: "HIGH",
    source: "jarvis-briefing",
  });
  return { text, announced: Boolean(row) };
}

export async function speakBootBriefing(report: StartupReport): Promise<void> {
  const bits = [
    `ZekerFlex is opgestart.`,
    report.database.ok
      ? `Database in orde met ${report.database.appliedMigrations} migraties.`
      : `Let op: database niet bereikbaar.`,
    report.database.pendingMigrations.length > 0
      ? `${report.database.pendingMigrations.length} migraties nog niet toegepast.`
      : "",
    report.llm.ok
      ? `Lokale AI bereikbaar op ${report.llm.model}.`
      : `Lokale AI niet bereikbaar.`,
    report.rag.tableReady ? `Geheugen bevat ${report.rag.chunks} fragmenten.` : "",
  ].filter(Boolean);

  await announce({
    text: bits.join(" "),
    category: "status",
    priority: "NORMAL",
    source: "jarvis-boot",
  });
}
