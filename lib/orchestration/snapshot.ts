import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { llmHealth } from "@/lib/ai/client";
import { pushChannels } from "@/lib/notifications/push";

// ---------------------------------------------------------------------------
// Observation phase of the orchestration cycle: a compact, structured picture
// of the platform's operational state that the LLM interprets.
// ---------------------------------------------------------------------------

export interface OrchestrationSnapshot {
  takenAt: string;
  health: {
    database: boolean;
    cache: boolean;
    llm: boolean;
    webPush: boolean;
  };
  queues: {
    openDisputes: number;
    timesheetsAwaitingApproval: number;
    staleOpenShifts: number;
    failedPayments: number;
    matchingBlockedFreelancers: number;
  };
  audit24h: {
    warnings: number;
    criticals: number;
    samples: Array<{
      action: string;
      severity: string;
      summary: string;
      createdAt: string;
    }>;
  };
  dba: { high: number; critical: number };
  sales: { newLeads: number; draftsAwaitingApproval: number };
}

async function ok(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

export async function gatherSnapshot(): Promise<OrchestrationSnapshot> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();

  const [
    database,
    cache,
    llm,
    openDisputes,
    timesheetsAwaitingApproval,
    staleOpenShifts,
    failedPayments,
    matchingBlockedFreelancers,
    warnings,
    criticals,
    samples,
    dbaHigh,
    dbaCritical,
    newLeads,
    draftsAwaitingApproval,
  ] = await Promise.all([
    ok(() => prisma.$queryRaw`SELECT 1`),
    ok(() => redis.ping()),
    llmHealth().then((h) => h.ok),
    prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    prisma.timesheet.count({ where: { status: { in: ["SUBMITTED", "DISPUTED"] } } }),
    prisma.shift.count({
      where: {
        status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
        startsAt: { lt: now },
      },
    }),
    prisma.payment.count({ where: { status: "FAILED" } }),
    prisma.freelancerProfile.count({
      where: { matchingBlockedUntil: { gt: now } },
    }),
    prisma.auditLog.count({
      where: { severity: "warning", createdAt: { gte: dayAgo } },
    }),
    prisma.auditLog.count({
      where: { severity: "critical", createdAt: { gte: dayAgo } },
    }),
    prisma.auditLog.findMany({
      where: {
        severity: { in: ["warning", "critical"] },
        createdAt: { gte: dayAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { action: true, severity: true, summary: true, createdAt: true },
    }),
    prisma.dbaComplianceRecord.count({ where: { riskLevel: "HIGH" } }),
    prisma.dbaComplianceRecord.count({ where: { riskLevel: "CRITICAL" } }),
    prisma.salesLead.count({ where: { status: "NEW" } }),
    prisma.salesOutreach.count({ where: { status: "DRAFT" } }),
  ]);

  return {
    takenAt: now.toISOString(),
    health: { database, cache, llm, webPush: pushChannels().webPush },
    queues: {
      openDisputes,
      timesheetsAwaitingApproval,
      staleOpenShifts,
      failedPayments,
      matchingBlockedFreelancers,
    },
    audit24h: {
      warnings,
      criticals,
      samples: samples.map((s) => ({
        action: s.action,
        severity: s.severity,
        summary: s.summary,
        createdAt: s.createdAt.toISOString(),
      })),
    },
    dba: { high: dbaHigh, critical: dbaCritical },
    sales: { newLeads, draftsAwaitingApproval },
  };
}
