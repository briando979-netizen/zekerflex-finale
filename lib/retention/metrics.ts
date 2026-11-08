import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { RetentionMetrics } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Subsystem 6: Success Metrics
//
// Cohort analysis, lifetime value (LTV) tracking, customer acquisition cost (CAC),
// and retention KPIs for data-driven retention strategy.
// ---------------------------------------------------------------------------

export const MetricsInputSchema = z.object({
  customerId: z.string(),
  totalRevenue: z.number().int().min(0),
  activeDays: z.number().int().min(0),
  totalSessions: z.number().int().min(0),
  avgSessionDuration: z.number().int().min(0).optional(),
  supportContactCount: z.number().int().min(0),
  featureAdoptionRate: z.number().min(0).max(100),
  npsAverage: z.number().min(0).max(10).optional(),
});

export type MetricsInput = z.infer<typeof MetricsInputSchema>;

/**
 * Calculate Lifetime Value (LTV) estimate.
 */
export function calculateLTV(revenue: number, monthsActive: number): number {
  if (monthsActive === 0) return 0;

  const monthlyRevenue = revenue / monthsActive;
  const avgCustomerLifetime = 36; // 3 years assumed average

  return Math.round(monthlyRevenue * avgCustomerLifetime);
}

/**
 * Predict churn probability from metrics.
 */
export function predictChurnProbability(metrics: {
  activeDays: number;
  totalSessions: number;
  featureAdoptionRate: number;
  supportContactCount: number;
}): number {
  let churnScore = 50; // Start at baseline

  // Active days: fewer active days = higher churn
  if (metrics.activeDays < 7) churnScore += 30;
  else if (metrics.activeDays < 30) churnScore += 15;
  else if (metrics.activeDays > 180) churnScore -= 20;

  // Sessions: fewer sessions = higher churn
  if (metrics.totalSessions < 5) churnScore += 25;
  else if (metrics.totalSessions < 20) churnScore += 10;
  else if (metrics.totalSessions > 100) churnScore -= 15;

  // Feature adoption: low adoption = higher churn
  if (metrics.featureAdoptionRate < 20) churnScore += 20;
  else if (metrics.featureAdoptionRate > 70) churnScore -= 25;

  // Support volume: high support = higher churn
  if (metrics.supportContactCount > 10) churnScore += 15;
  else if (metrics.supportContactCount === 0 && metrics.totalSessions > 50) churnScore -= 10;

  return Math.min(100, Math.max(0, churnScore));
}

/**
 * Get or create metrics for a customer.
 */
export async function getOrCreateMetrics(customerId: string): Promise<RetentionMetrics> {
  let metrics = await prisma.retentionMetrics.findUnique({
    where: { customerId },
  });

  if (!metrics) {
    metrics = await prisma.retentionMetrics.create({
      data: {
        customerId,
        cohortCreatedAt: new Date(),
        cohortMonth: new Date().toISOString().substring(0, 7),
      },
    });
  }

  return metrics;
}

/**
 * Update metrics for a customer.
 */
export async function updateMetrics(customerId: string, input: MetricsInput): Promise<RetentionMetrics> {
  try {
    const validated = MetricsInputSchema.parse(input);

    let metrics = await getOrCreateMetrics(customerId);

    // Calculate months active
    const monthsActive = Math.max(1, Math.floor((Date.now() - metrics.cohortCreatedAt.getTime()) / (30 * 24 * 60 * 60 * 1000)));

    // Calculate LTV
    const lifetimeValue = calculateLTV(validated.totalRevenue, monthsActive);

    // Calculate ARR projection
    const monthlyRevenue = monthsActive > 0 ? validated.totalRevenue / monthsActive : 0;
    const yearlyRevenueRun = Math.round(monthlyRevenue * 12);

    // Predict churn
    const churnProbability = predictChurnProbability({
      activeDays: validated.activeDays,
      totalSessions: validated.totalSessions,
      featureAdoptionRate: validated.featureAdoptionRate,
      supportContactCount: validated.supportContactCount,
    });

    metrics = await prisma.retentionMetrics.update({
      where: { customerId },
      data: {
        totalRevenue: validated.totalRevenue,
        lifetimeValue,
        yearlyRevenueRun,
        activeDays: validated.activeDays,
        totalSessions: validated.totalSessions,
        avgSessionDuration: validated.avgSessionDuration ?? null,
        supportContactCount: validated.supportContactCount,
        featureAdoptionRate: validated.featureAdoptionRate,
        npsAverage: validated.npsAverage ?? null,
      },
    });

    logger.debug("Metrics updated", {
      customerId,
      ltv: lifetimeValue,
      churnProbability,
    });

    return metrics;
  } catch (err) {
    logger.error("Failed to update metrics", {
      error: (err as Error).message,
    });
    throw AppError.validation("Metrieken bijwerken mislukt.");
  }
}

/**
 * Mark customer as churned.
 */
export async function markAsChurned(customerId: string, reason?: string): Promise<RetentionMetrics> {
  const metrics = await getOrCreateMetrics(customerId);

  return prisma.retentionMetrics.update({
    where: { customerId },
    data: {
      isActive: false,
      churnedAt: new Date(),
      churnReason: reason ?? null,
    },
  });
}

/**
 * Calculate cohort retention rate.
 */
export async function calculateCohortRetention(cohortMonth: string): Promise<{
  cohort_month: string;
  initial_count: number;
  current_count: number;
  retention_rate: number;
}> {
  const cohortMetrics = await prisma.retentionMetrics.findMany({
    where: { cohortMonth },
  });

  const initialCount = cohortMetrics.length;
  const currentlyActive = cohortMetrics.filter((m) => m.isActive).length;
  const retentionRate = initialCount > 0 ? Math.round((currentlyActive / initialCount) * 100) : 0;

  logger.info("Cohort retention calculated", {
    cohortMonth,
    initial: initialCount,
    active: currentlyActive,
    retention: retentionRate,
  });

  return {
    cohort_month: cohortMonth,
    initial_count: initialCount,
    current_count: currentlyActive,
    retention_rate: retentionRate,
  };
}

/**
 * Get top customers by LTV.
 */
export async function getTopCustomersByLTV(limit = 50): Promise<RetentionMetrics[]> {
  return prisma.retentionMetrics.findMany({
    where: { isActive: true },
    orderBy: { lifetimeValue: "desc" },
    take: limit,
  });
}

/**
 * Get at-risk customers (high churn probability).
 */
export async function getAtRiskCustomers(limit = 50): Promise<
  Array<{
    metrics: RetentionMetrics;
    churnProbability: number;
  }>
> {
  const metrics = await prisma.retentionMetrics.findMany({
    where: { isActive: true },
    take: limit * 2, // Get more to filter
  });

  const atRisk = metrics
    .map((m) => ({
      metrics: m,
      churnProbability: predictChurnProbability({
        activeDays: m.activeDays,
        totalSessions: m.totalSessions,
        featureAdoptionRate: m.featureAdoptionRate ?? 0,
        supportContactCount: m.supportContactCount,
      }),
    }))
    .filter((item) => item.churnProbability > 60)
    .sort((a, b) => b.churnProbability - a.churnProbability)
    .slice(0, limit);

  return atRisk;
}

/**
 * Generate retention report.
 */
export async function generateRetentionReport(): Promise<{
  total_customers: number;
  active_customers: number;
  churned_customers: number;
  retention_rate: number;
  avg_ltv: number;
  total_ltv: number;
  avg_arr: number;
  top_churn_reasons: Record<string, number>;
}> {
  const allMetrics = await prisma.retentionMetrics.findMany();

  const active = allMetrics.filter((m) => m.isActive).length;
  const churned = allMetrics.filter((m) => !m.isActive).length;

  const avgLTV = allMetrics.length > 0 ? Math.round(allMetrics.reduce((sum, m) => sum + m.lifetimeValue, 0) / allMetrics.length) : 0;

  const totalLTV = allMetrics.reduce((sum, m) => sum + m.lifetimeValue, 0);

  const avgARR = allMetrics.length > 0 ? Math.round(allMetrics.reduce((sum, m) => sum + m.yearlyRevenueRun, 0) / allMetrics.length) : 0;

  const churnReasons: Record<string, number> = {};
  for (const metric of allMetrics) {
    if (metric.churnReason) {
      churnReasons[metric.churnReason] = (churnReasons[metric.churnReason] ?? 0) + 1;
    }
  }

  const retentionRate = allMetrics.length > 0 ? Math.round((active / allMetrics.length) * 100) : 0;

  logger.info("Retention report generated", {
    total: allMetrics.length,
    active,
    avgLTV,
    retentionRate,
  });

  return {
    total_customers: allMetrics.length,
    active_customers: active,
    churned_customers: churned,
    retention_rate: retentionRate,
    avg_ltv: avgLTV,
    total_ltv: totalLTV,
    avg_arr: avgARR,
    top_churn_reasons: Object.fromEntries(
      Object.entries(churnReasons)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5),
    ),
  };
}

/**
 * Calculate CAC payback period.
 */
export function calculatePaybackPeriod(cac: number, monthlyRevenue: number): number {
  if (monthlyRevenue === 0) return -1; // Infinite payback
  return Math.ceil(cac / monthlyRevenue);
}

/**
 * Get customers with long payback periods (at-risk investments).
 */
export async function getLongPaybackCustomers(maxPaybackMonths = 12): Promise<RetentionMetrics[]> {
  const metrics = await prisma.retentionMetrics.findMany({
    where: {
      isActive: true,
      customerAcquisitionCost: { not: null },
      paybackPeriodMonths: { gt: maxPaybackMonths },
    },
    orderBy: { paybackPeriodMonths: "desc" },
    take: 50,
  });

  return metrics;
}
