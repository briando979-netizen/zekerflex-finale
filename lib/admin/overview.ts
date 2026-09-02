import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { budgetSnapshot } from "@/lib/ai/governor";
import { llmHealth } from "@/lib/ai/client";
import { liveTraffic } from "@/lib/analytics/report";
import { pushChannels } from "@/lib/notifications/push";

// ---------------------------------------------------------------------------
// One aggregated snapshot for the Admin Control Center (and a compact form for
// Jarvis' live context). Every piece is best-effort - a slow/absent dependency
// degrades to a null field, never an error.
// ---------------------------------------------------------------------------

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export interface AdminOverview {
  at: string;
  health: {
    database: boolean;
    cache: boolean;
    llm: { ok: boolean; model: string; local: boolean };
    webPush: boolean;
  };
  ai: {
    tokensToday: number;
    tokenBudget: number;
    concurrencyInUse: number;
    concurrencyMax: number;
    requestsThisMinute: number;
  };
  queues: {
    openDisputes: number;
    timesheetsToApprove: number;
    staleOpenShifts: number;
    failedPayments: number;
    openFindings: number;
  };
  traffic: {
    activeVisitors: number;
    pageviewsToday: number;
    visitorsToday: number;
  };
  agents: { agent: string; lastTitle: string; at: string }[];
  recentFindings: {
    severity: string;
    category: string;
    title: string;
    createdAt: string;
  }[];
  voiceQueued: number;
  ragChunks: number;
  runningTurns: number;
}

export async function buildAdminOverview(): Promise<AdminOverview> {
  const now = new Date();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [
    dbOk,
    cacheOk,
    health,
    budget,
    traffic,
    openDisputes,
    timesheetsToApprove,
    staleOpenShifts,
    failedPayments,
    openFindings,
    agentEvents,
    findings,
    voiceQueued,
    ragChunks,
    runningTurns,
  ] = await Promise.all([
    safe(async () => {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    }, false),
    safe(async () => {
      await redis.ping();
      return true;
    }, false),
    llmHealth(),
    safe(() => budgetSnapshot(), null),
    safe(() => liveTraffic(), null),
    safe(() => prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }), 0),
    safe(() => prisma.timesheet.count({ where: { status: { in: ["SUBMITTED", "DISPUTED"] } } }), 0),
    safe(() => prisma.shift.count({ where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { lt: now } } }), 0),
    safe(() => prisma.payment.count({ where: { status: "FAILED" } }), 0),
    safe(() => prisma.orchestrationFinding.count({ where: { status: "OPEN" } }), 0),
    safe(
      () =>
        prisma.jarvisEvent.findMany({
          where: { kind: { in: ["AGENT_DELEGATION", "TOOL_CALL"] } },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { agent: true, title: true, createdAt: true },
        }),
      [] as { agent: string; title: string; createdAt: Date }[],
    ),
    safe(
      () =>
        prisma.orchestrationFinding.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { severity: true, category: true, title: true, createdAt: true },
        }),
      [] as { severity: string; category: string; title: string; createdAt: Date }[],
    ),
    safe(() => prisma.voiceAnnouncement.count({ where: { spokenAt: null } }), 0),
    safe(() => prisma.ragChunk.count(), 0),
    safe(() => prisma.jarvisTurn.count({ where: { status: "RUNNING" } }), 0),
  ]);

  const seen = new Set<string>();
  const agents = agentEvents
    .filter((e) => (seen.has(e.agent) ? false : (seen.add(e.agent), true)))
    .slice(0, 4)
    .map((e) => ({ agent: e.agent, lastTitle: e.title, at: e.createdAt.toISOString() }));

  return {
    at: now.toISOString(),
    health: {
      database: dbOk,
      cache: cacheOk,
      llm: {
        ok: health.ok,
        model: health.model,
        local: /^(localhost|127\.|0\.0\.0\.0|\[?::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|.+\.local)/i.test(
          new URL(health.baseUrl).hostname,
        ),
      },
      webPush: pushChannels().webPush,
    },
    ai: {
      tokensToday: budget?.tokensUsed ?? 0,
      tokenBudget: budget?.tokenBudget ?? 0,
      concurrencyInUse: budget?.concurrencyInUse ?? 0,
      concurrencyMax: budget?.concurrencyMax ?? 0,
      requestsThisMinute: budget?.requestsThisMinute ?? 0,
    },
    queues: { openDisputes, timesheetsToApprove, staleOpenShifts, failedPayments, openFindings },
    traffic: {
      activeVisitors: traffic?.activeVisitors ?? 0,
      pageviewsToday: traffic?.pageviewsToday ?? 0,
      visitorsToday: traffic?.visitorsToday ?? 0,
    },
    agents,
    recentFindings: findings.map((f) => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      createdAt: f.createdAt.toISOString(),
    })),
    voiceQueued,
    ragChunks,
    runningTurns,
  };
}

/** One compact line of live state, for Jarvis' system context. */
export async function jarvisStateLine(): Promise<string> {
  const o = await buildAdminOverview();
  return (
    `LIVE PLATFORMSTATUS (${o.at}): ` +
    `db=${o.health.database ? "ok" : "down"}, ` +
    `ai=${o.health.llm.ok ? o.health.llm.model : "offline"}, ` +
    `open geschillen=${o.queues.openDisputes}, ` +
    `urenbriefjes te keuren=${o.queues.timesheetsToApprove}, ` +
    `mislukte betalingen=${o.queues.failedPayments}, ` +
    `open bevindingen=${o.queues.openFindings}, ` +
    `actieve bezoekers=${o.traffic.activeVisitors}, ` +
    `bezoekers vandaag=${o.traffic.visitorsToday}, ` +
    `geheugen-fragmenten=${o.ragChunks}, ` +
    `AI-tokens vandaag=${o.ai.tokensToday}/${o.ai.tokenBudget}.`
  );
}
