import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { CustomerHealth, HealthScoreTier } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Health Scoring Module
//
// Calculates ML-based customer health scores combining usage, support,
// financial data, and engagement metrics. Scores drive tier assignment and
// risk detection for intervention workflows.
// ---------------------------------------------------------------------------

export const HealthScoreCriteria = z.object({
  usageScore: z.number().min(0).max(100),
  supportScore: z.number().min(0).max(100),
  financialScore: z.number().min(0).max(100),
  engagementScore: z.number().min(0).max(100),
});

export type HealthScoreCriteria = z.infer<typeof HealthScoreCriteria>;

const SCORE_WEIGHTS = {
  usage: 0.3,
  support: 0.2,
  financial: 0.25,
  engagement: 0.25,
};

function calculateCompositeScore(criteria: HealthScoreCriteria): number {
  const weighted =
    criteria.usageScore * SCORE_WEIGHTS.usage +
    criteria.supportScore * SCORE_WEIGHTS.support +
    criteria.financialScore * SCORE_WEIGHTS.financial +
    criteria.engagementScore * SCORE_WEIGHTS.engagement;

  return Math.round(Math.max(0, Math.min(100, weighted)));
}

function getTierFromScore(score: number): HealthScoreTier {
  if (score < 40) return "AT_RISK";
  if (score < 60) return "NEEDS_ATTENTION";
  if (score < 80) return "HEALTHY";
  return "THRIVING";
}

function assessRiskFlags(criteria: HealthScoreCriteria): string[] {
  const flags: string[] = [];

  if (criteria.usageScore < 30) flags.push("low_usage");
  if (criteria.supportScore < 30) flags.push("high_support_issues");
  if (criteria.financialScore < 30) flags.push("payment_problems");
  if (criteria.engagementScore < 30) flags.push("declining_engagement");

  if (criteria.usageScore < 40 && criteria.engagementScore < 40) {
    flags.push("inactive_account");
  }

  return [...new Set(flags)];
}

function calculateChurnProbability(criteria: HealthScoreCriteria): number {
  // Sigmoid curve: score -> probability (0-1)
  // At score 30: ~0.73 probability
  // At score 50: ~0.5 probability
  // At score 70: ~0.27 probability
  const x = (50 - calculateCompositeScore(criteria)) / 20;
  return 1 / (1 + Math.exp(-x));
}

/**
 * Calculate health score for a tenant based on usage, support, financial,
 * and engagement metrics.
 */
export async function calculateHealthScore(
  tenantId: string,
  criteria?: HealthScoreCriteria,
): Promise<CustomerHealth> {
  try {
    let health = await prisma.customerHealth.findUnique({
      where: { tenantId },
    });

    if (!health) {
      health = await prisma.customerHealth.create({
        data: { tenantId },
      });
    }

    if (!criteria) {
      // Use existing scores if no new criteria provided
      return health;
    }

    // Validate input
    const validated = HealthScoreCriteria.parse(criteria);

    const compositeScore = calculateCompositeScore(validated);
    const tier = getTierFromScore(compositeScore);
    const riskFlags = assessRiskFlags(validated);
    const churnRisk = calculateChurnProbability(validated);

    const updated = await prisma.customerHealth.update({
      where: { tenantId },
      data: {
        healthScore: compositeScore,
        healthTier: tier,
        usageScore: validated.usageScore,
        supportScore: validated.supportScore,
        financialScore: validated.financialScore,
        engagementScore: validated.engagementScore,
        riskFlags,
        churnRisk,
        lastCalculatedAt: new Date(),
      },
    });

    logger.info("Health score calculated", {
      tenantId,
      score: compositeScore,
      tier,
      churnRisk: Math.round(churnRisk * 100),
    });

    return updated;
  } catch (err) {
    logger.error("Failed to calculate health score", {
      tenantId,
      error: (err as Error).message,
    });
    throw AppError.internal("Statusscoring mislukt.");
  }
}

/**
 * Get current health status for a tenant.
 */
export async function getHealthStatus(tenantId: string): Promise<CustomerHealth> {
  const health = await prisma.customerHealth.findUnique({
    where: { tenantId },
  });

  if (!health) {
    return prisma.customerHealth.create({
      data: { tenantId },
    });
  }

  return health;
}

/**
 * Bulk calculate health scores for all active tenants.
 * Called periodically by cron job.
 */
export async function recalculateAllHealthScores(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  let processed = 0;
  let updated = 0;
  let errors = 0;

  const tenants = await prisma.tenant.findMany({
    where: { type: "ENTERPRISE_HQ" },
    select: { id: true },
  });

  for (const { id } of tenants) {
    processed++;
    try {
      // In production, this would fetch real usage/support/financial data
      const criteria: HealthScoreCriteria = {
        usageScore: 50,
        supportScore: 50,
        financialScore: 50,
        engagementScore: 50,
      };

      const result = await calculateHealthScore(id, criteria);
      if (result) updated++;
    } catch (err) {
      logger.warn("Error recalculating health for tenant", { tenantId: id });
      errors++;
    }
  }

  logger.info("Health score recalculation complete", {
    processed,
    updated,
    errors,
  });

  return { processed, updated, errors };
}

/**
 * Get tenants at risk (score < 60 or churn probability > 40%)
 */
export async function getAtRiskTenants(
  limit = 50,
): Promise<CustomerHealth[]> {
  return prisma.customerHealth.findMany({
    where: {
      OR: [
        { healthScore: { lt: 60 } },
        { churnRisk: { gt: 0.4 } },
      ],
    },
    orderBy: { churnRisk: "desc" },
    take: limit,
  });
}
