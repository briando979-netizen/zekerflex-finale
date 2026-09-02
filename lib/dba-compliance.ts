import {
  DbaAction,
  DbaRiskLevel,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type {
  DbaEvaluation,
  DbaMetrics,
  DbaThresholds,
  DbaWindow,
} from "@/types/compliance";

// ---------------------------------------------------------------------------
// Wet DBA compliance monitor
//
// Goal: detect when a freelancer's engagement pattern at one client (branch and
// its parent tenant) starts to resemble a disguised employment relationship
// ("fictieve dienstbetrekking" / schijnzelfstandigheid) and intervene BEFORE a
// new shift is matched, rather than after the fact.
//
// The monitor is advisory-plus-enforcing: it always records an evaluation, and
// for the two most severe levels it writes a matching block onto the freelancer
// profile that `assertFreelancerMatchable` (used by the matching engine and the
// timesheet-approval route) enforces.
// ---------------------------------------------------------------------------

const ROLLING_WINDOW_DAYS = 365;
const THROTTLE_COOLDOWN_DAYS = 28;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// Disguised employment is a pattern that only emerges over time. Below this much
// history there is not enough signal to assess it - forcing a low-data record to
// LOW/NONE avoids throttling a freelancer on their first shift at a client just
// because it is momentarily 100% of their platform revenue.
const MIN_ENGAGEMENTS_TO_ASSESS = 5;
const MIN_HOURS_TO_ASSESS = 24;
const MIN_WEEKS_TO_ASSESS = 4;
// The revenue-concentration signal additionally needs real absolute volume.
const REVENUE_SHARE_MIN_HOURS = 60;

function defaultThresholds(): DbaThresholds {
  return {
    maxHoursPerClient: env.DBA_MAX_HOURS_PER_CLIENT,
    warnHoursPerClient: env.DBA_WARN_HOURS_PER_CLIENT,
    maxConsecutiveWeeks: env.DBA_MAX_CONSECUTIVE_WEEKS,
    maxClientRevenueShare: env.DBA_MAX_CLIENT_REVENUE_SHARE,
  };
}

function isoWeekKey(d: Date): string {
  // ISO-8601 week number.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function maxConsecutiveWeeks(weekKeys: Set<string>): number {
  if (weekKeys.size === 0) return 0;
  // Convert week keys back to a comparable weekly index via Monday date.
  const indices = [...weekKeys]
    .map((k) => {
      const [y, w] = k.split("-W");
      const jan4 = new Date(Date.UTC(Number(y), 0, 4));
      const monday = new Date(jan4);
      monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (Number(w) - 1) * 7);
      return Math.round(monday.getTime() / MS_PER_WEEK);
    })
    .sort((a, b) => a - b);

  let best = 1;
  let run = 1;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1]! + 1) {
      run += 1;
      best = Math.max(best, run);
    } else if (indices[i] !== indices[i - 1]) {
      run = 1;
    }
  }
  return best;
}

interface ApprovedEntry {
  branchId: string;
  tenantId: string;
  billableMinutes: number;
  workedAt: Date;
  grossCents: number;
}

async function collectApprovedWork(
  freelancerId: string,
  window: DbaWindow,
): Promise<ApprovedEntry[]> {
  const rows = await prisma.timesheet.findMany({
    where: {
      freelancerId,
      status: { in: ["APPROVED", "PAID"] },
      scheduledStart: { gte: window.start, lte: window.end },
    },
    select: {
      branchId: true,
      billableMinutes: true,
      hourlyRateCents: true,
      scheduledStart: true,
      branch: { select: { tenantId: true } },
    },
  });

  return rows.map((r) => ({
    branchId: r.branchId,
    tenantId: r.branch.tenantId,
    billableMinutes: r.billableMinutes,
    workedAt: r.scheduledStart,
    grossCents: Math.round((r.billableMinutes / 60) * r.hourlyRateCents),
  }));
}

export function computeMetrics(
  entries: ApprovedEntry[],
  target: { branchId: string; tenantId: string },
): DbaMetrics {
  const clientEntries = entries.filter((e) => e.tenantId === target.tenantId);

  const totalMinutes = clientEntries.reduce((s, e) => s + e.billableMinutes, 0);
  const clientGross = clientEntries.reduce((s, e) => s + e.grossCents, 0);
  const allGross = entries.reduce((s, e) => s + e.grossCents, 0);

  const weekKeys = new Set(clientEntries.map((e) => isoWeekKey(e.workedAt)));
  const distinctWeeks = weekKeys.size;

  return {
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    engagementCount: clientEntries.length,
    distinctWeeks,
    maxConsecutiveWeeks: maxConsecutiveWeeks(weekKeys),
    averageHoursPerActiveWeek:
      distinctWeeks === 0
        ? 0
        : Math.round((totalMinutes / 60 / distinctWeeks) * 10) / 10,
    clientRevenueShare: allGross === 0 ? 0 : clientGross / allGross,
    distinctBranchCount: new Set(entries.map((e) => e.branchId)).size,
  };
}

export function classify(
  metrics: DbaMetrics,
  thresholds: DbaThresholds,
): Pick<DbaEvaluation, "riskLevel" | "action" | "rationale" | "signals"> {
  const enoughHistory =
    metrics.engagementCount >= MIN_ENGAGEMENTS_TO_ASSESS &&
    (metrics.totalHours >= MIN_HOURS_TO_ASSESS ||
      metrics.distinctWeeks >= MIN_WEEKS_TO_ASSESS);

  const signals: DbaEvaluation["signals"] = [
    {
      key: "hours",
      label: "Hours at this client (rolling 12m)",
      value: metrics.totalHours,
      threshold: thresholds.maxHoursPerClient,
      breached: metrics.totalHours >= thresholds.maxHoursPerClient,
    },
    {
      key: "consecutiveWeeks",
      label: "Consecutive weeks worked",
      value: metrics.maxConsecutiveWeeks,
      threshold: thresholds.maxConsecutiveWeeks,
      breached: metrics.maxConsecutiveWeeks >= thresholds.maxConsecutiveWeeks,
    },
    {
      key: "revenueShare",
      label: "Share of freelancer revenue from this client",
      value: Math.round(metrics.clientRevenueShare * 100) / 100,
      threshold: thresholds.maxClientRevenueShare,
      breached:
        metrics.totalHours >= REVENUE_SHARE_MIN_HOURS &&
        metrics.clientRevenueShare >= thresholds.maxClientRevenueShare,
    },
    {
      key: "regularity",
      label: "Average hours per active week",
      value: metrics.averageHoursPerActiveWeek,
      threshold: 32,
      breached:
        metrics.averageHoursPerActiveWeek >= 32 && metrics.distinctWeeks >= 8,
    },
  ];

  if (!enoughHistory) {
    return {
      riskLevel: DbaRiskLevel.LOW,
      action: DbaAction.NONE,
      rationale: `Insufficient history to assess disguised employment (${metrics.engagementCount} engagement(s), ${metrics.totalHours}h, ${metrics.distinctWeeks} week(s)).`,
      signals,
    };
  }

  const breachedCount = signals.filter((s) => s.breached).length;
  const hoursWarn = metrics.totalHours >= thresholds.warnHoursPerClient;

  let riskLevel: DbaRiskLevel;
  let action: DbaAction;

  if (breachedCount >= 2) {
    riskLevel = DbaRiskLevel.CRITICAL;
    action = DbaAction.BLOCK;
  } else if (breachedCount === 1) {
    riskLevel = DbaRiskLevel.HIGH;
    action = DbaAction.THROTTLE;
  } else if (hoursWarn || metrics.maxConsecutiveWeeks >= thresholds.maxConsecutiveWeeks * 0.7) {
    riskLevel = DbaRiskLevel.MEDIUM;
    action = DbaAction.WARN;
  } else {
    riskLevel = DbaRiskLevel.LOW;
    action = DbaAction.NONE;
  }

  const breachedLabels = signals
    .filter((s) => s.breached)
    .map((s) => `${s.label} (${s.value} ≥ ${s.threshold})`);

  const rationale =
    action === DbaAction.NONE
      ? "Engagement pattern within safe bounds for self-employment."
      : `${breachedCount} threshold(s) breached: ${
          breachedLabels.join("; ") || "approaching limits"
        }. Freelancer should demonstrate independence (multiple clients, own risk, free substitution).`;

  return { riskLevel, action, rationale, signals };
}

export interface EvaluateOptions {
  window?: DbaWindow;
  thresholds?: Partial<DbaThresholds>;
  /** Skip writing a DbaComplianceRecord / profile block (dry run). */
  persist?: boolean;
}

/**
 * Evaluate one freelancer against one branch's client (tenant) and, unless
 * `persist` is false, record the result and apply any matching block.
 */
export async function evaluateDbaCompliance(
  freelancerId: string,
  branchId: string,
  opts: EvaluateOptions = {},
): Promise<DbaEvaluation> {
  const now = new Date();
  const window: DbaWindow = opts.window ?? {
    start: new Date(now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000),
    end: now,
  };
  const thresholds = { ...defaultThresholds(), ...opts.thresholds };

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, tenantId: true },
  });
  if (!branch) throw AppError.notFound("Branch not found");

  const entries = await collectApprovedWork(freelancerId, window);
  const metrics = computeMetrics(entries, {
    branchId,
    tenantId: branch.tenantId,
  });
  const { riskLevel, action, rationale, signals } = classify(metrics, thresholds);

  let matchingBlockedUntil: Date | null = null;
  if (action === DbaAction.THROTTLE) {
    matchingBlockedUntil = new Date(
      now.getTime() + THROTTLE_COOLDOWN_DAYS * 86_400_000,
    );
  } else if (action === DbaAction.BLOCK) {
    // Indefinite until a compliance officer clears it.
    matchingBlockedUntil = new Date("2999-12-31T00:00:00Z");
  }

  const evaluation: DbaEvaluation = {
    freelancerId,
    branchId,
    window,
    metrics,
    riskLevel,
    action,
    rationale,
    signals,
    matchingBlockedUntil,
  };

  if (opts.persist === false) return evaluation;

  await prisma.$transaction(async (tx) => {
    await tx.dbaComplianceRecord.create({
      data: {
        freelancerId,
        branchId,
        windowStart: window.start,
        windowEnd: window.end,
        totalMinutes: metrics.totalMinutes,
        engagementCount: metrics.engagementCount,
        distinctWeeks: metrics.distinctWeeks,
        maxConsecutiveWeeks: metrics.maxConsecutiveWeeks,
        clientRevenueShare: metrics.clientRevenueShare,
        riskLevel,
        action,
        rationale,
      },
    });

    if (matchingBlockedUntil) {
      await tx.freelancerProfile.update({
        where: { id: freelancerId },
        data: { matchingBlockedUntil },
      });
    }
  });

  logger.info("dba evaluation", {
    freelancerId,
    branchId,
    riskLevel,
    action,
    hours: metrics.totalHours,
    revenueShare: Math.round(metrics.clientRevenueShare * 100) / 100,
  });

  return evaluation;
}

/**
 * Guard used by the matching engine and the approval route. Throws a
 * COMPLIANCE_BLOCKED error when the freelancer currently carries a matching
 * block (from a THROTTLE cooldown or a BLOCK).
 */
export async function assertFreelancerMatchable(
  freelancerId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const profile = await tx.freelancerProfile.findUnique({
    where: { id: freelancerId },
    select: { matchingBlockedUntil: true, isBlacklisted: true, blacklistReason: true },
  });
  if (!profile) throw AppError.notFound("Freelancer profile not found");

  if (profile.isBlacklisted) {
    throw AppError.complianceBlocked(
      profile.blacklistReason ?? "Freelancer is blacklisted",
    );
  }
  if (
    profile.matchingBlockedUntil &&
    profile.matchingBlockedUntil.getTime() > Date.now()
  ) {
    throw AppError.complianceBlocked(
      "Freelancer is temporarily blocked from matching at this client (Wet DBA compliance)",
      { until: profile.matchingBlockedUntil.toISOString() },
    );
  }
}
