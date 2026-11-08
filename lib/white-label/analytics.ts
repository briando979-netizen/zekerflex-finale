import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Tenant Analytics - Usage analytics per tenant, SaaS metrics, cohort analysis, churn prediction
 */

const analyticsMetricsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  activeUsers: z.number().int().nonnegative().default(0),
  totalRequests: z.number().int().nonnegative().default(0),
  apiCallsCount: z.number().int().nonnegative().default(0),
  webhookDeliveries: z.number().int().nonnegative().default(0),
  errorCount: z.number().int().nonnegative().default(0),
  avgResponseTimeMs: z.number().nonnegative().default(0),
  revenue: z.number().int().nonnegative().default(0),
  subscriptionValue: z.number().int().nonnegative().default(0),
  churnRisk: z.number().min(0).max(1).default(0),
  featureUsage: z.record(z.number()).default({}),
  integrationsUsed: z.record(z.boolean()).default({}),
});

export type AnalyticsMetrics = z.infer<typeof analyticsMetricsSchema>;

/**
 * Record daily analytics for a tenant
 */
export async function recordDailyAnalytics(
  tenantId: string,
  metrics: Partial<AnalyticsMetrics>
) {
  const today = new Date().toISOString().split("T")[0];
  const validated = analyticsMetricsSchema.parse({
    date: today,
    ...metrics,
  });

  return await prisma.tenantAnalytics.upsert({
    where: {
      tenantId_date: {
        tenantId,
        date: today,
      },
    },
    update: {
      activeUsers: validated.activeUsers,
      totalRequests: validated.totalRequests,
      apiCallsCount: validated.apiCallsCount,
      webhookDeliveries: validated.webhookDeliveries,
      errorCount: validated.errorCount,
      avgResponseTimeMs: validated.avgResponseTimeMs,
      revenue: validated.revenue,
      subscriptionValue: validated.subscriptionValue,
      churnRisk: validated.churnRisk,
      featureUsage: validated.featureUsage,
      integrationsUsed: validated.integrationsUsed,
    },
    create: {
      tenantId,
      date: today,
      ...validated,
    },
  });
}

/**
 * Get analytics for a tenant over a date range
 */
export async function getTenantAnalytics(
  tenantId: string,
  startDate: string,
  endDate: string
) {
  return await prisma.tenantAnalytics.findMany({
    where: {
      tenantId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: "asc" },
  });
}

/**
 * Calculate monthly recurring revenue (MRR) for a tenant
 */
export async function calculateMrr(tenantId: string, monthYearStr?: string): Promise<number> {
  const now = new Date();
  const month = monthYearStr ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const analytics = await prisma.tenantAnalytics.findMany({
    where: {
      tenantId,
      date: {
        startsWith: month,
      },
    },
  });

  if (analytics.length === 0) {
    return 0;
  }

  // MRR = average daily subscription value * 30 days
  const avgDaily =
    analytics.reduce((sum, a) => sum + (a.subscriptionValue ?? 0), 0) / analytics.length;

  return Math.round(avgDaily * 30);
}

/**
 * Calculate churn rate for a time period
 */
export async function calculateChurnRate(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const analytics = await getTenantAnalytics(tenantId, startDate, endDate);

  if (analytics.length === 0) {
    return 0;
  }

  // Average churn risk across the period
  const avgChurnRisk = analytics.reduce((sum, a) => sum + (a.churnRisk ?? 0), 0) / analytics.length;

  return avgChurnRisk;
}

/**
 * Get usage metrics for current month
 */
export async function getCurrentMonthUsage(tenantId: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const startDate = `${year}-${month}-01`;

  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const endDate = `${year}-${month}-${lastDay}`;

  return await getTenantAnalytics(tenantId, startDate, endDate);
}

/**
 * Get average response time for a tenant
 */
export async function getAverageResponseTime(
  tenantId: string,
  startDate?: string,
  endDate?: string
): Promise<number> {
  const start = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const end = endDate ?? new Date().toISOString().split("T")[0];

  const analytics = await getTenantAnalytics(tenantId, start, end);

  if (analytics.length === 0) {
    return 0;
  }

  const total = analytics.reduce((sum, a) => sum + (a.avgResponseTimeMs ?? 0), 0);
  return total / analytics.length;
}

/**
 * Get error rate for a tenant
 */
export async function getErrorRate(
  tenantId: string,
  startDate?: string,
  endDate?: string
): Promise<number> {
  const start = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const end = endDate ?? new Date().toISOString().split("T")[0];

  const analytics = await getTenantAnalytics(tenantId, start, end);

  if (analytics.length === 0) {
    return 0;
  }

  const totalRequests = analytics.reduce((sum, a) => sum + (a.totalRequests ?? 0), 0);
  const totalErrors = analytics.reduce((sum, a) => sum + (a.errorCount ?? 0), 0);

  if (totalRequests === 0) {
    return 0;
  }

  return (totalErrors / totalRequests) * 100;
}

/**
 * Get top features used by a tenant
 */
export async function getTopFeaturesUsed(
  tenantId: string,
  limit: number = 10
): Promise<Array<{ feature: string; usageCount: number }>> {
  const month = new Date();
  const startDate = new Date(month.getFullYear(), month.getMonth(), 1).toISOString().split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  const analytics = await getTenantAnalytics(tenantId, startDate, endDate);

  const featureUsage: Record<string, number> = {};

  for (const day of analytics) {
    const features = (day.featureUsage ?? {}) as Record<string, number>;
    for (const [feature, count] of Object.entries(features)) {
      featureUsage[feature] = (featureUsage[feature] ?? 0) + count;
    }
  }

  return Object.entries(featureUsage)
    .map(([feature, usageCount]) => ({ feature, usageCount }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);
}

/**
 * Calculate health score for a tenant (0-100)
 */
export async function calculateTenantHealthScore(tenantId: string): Promise<number> {
  const analytics = await getCurrentMonthUsage(tenantId);

  if (analytics.length === 0) {
    return 0;
  }

  // Health score based on multiple factors
  const latest = analytics[analytics.length - 1];
  const avgResponseTime = await getAverageResponseTime(tenantId);
  const errorRate = await getErrorRate(tenantId);
  const activeUsers = latest?.activeUsers ?? 0;

  let score = 100;

  // Deduct for high error rate
  score -= Math.min(errorRate * 0.5, 30);

  // Deduct for slow response times
  if (avgResponseTime > 1000) {
    score -= 20;
  } else if (avgResponseTime > 500) {
    score -= 10;
  }

  // Bonus for active usage
  if (activeUsers > 100) {
    score += 10;
  }

  // Account for churn risk
  const churnRisk = latest?.churnRisk ?? 0;
  score -= churnRisk * 30;

  return Math.max(0, Math.min(100, score));
}

/**
 * Identify high-risk tenants for churn
 */
export async function identifyChurnRisks(
  threshold: number = 0.7
): Promise<Array<{ tenantId: string; churnRisk: number }>> {
  const today = new Date().toISOString().split("T")[0];

  const atRiskTenants = await prisma.tenantAnalytics.findMany({
    where: {
      date: today,
      churnRisk: {
        gte: threshold,
      },
    },
    select: {
      tenantId: true,
      churnRisk: true,
    },
    distinct: ["tenantId"],
  });

  return atRiskTenants.map((t) => ({
    tenantId: t.tenantId,
    churnRisk: t.churnRisk ?? 0,
  }));
}

/**
 * Track API call usage for rate limiting and quota management
 */
export async function trackApiCall(tenantId: string) {
  const today = new Date().toISOString().split("T")[0];

  const analytics = await prisma.tenantAnalytics.findUnique({
    where: {
      tenantId_date: {
        tenantId,
        date: today,
      },
    },
  });

  if (analytics) {
    return await prisma.tenantAnalytics.update({
      where: {
        tenantId_date: {
          tenantId,
          date: today,
        },
      },
      data: {
        apiCallsCount: (analytics.apiCallsCount ?? 0) + 1,
        totalRequests: (analytics.totalRequests ?? 0) + 1,
      },
    });
  }

  return await prisma.tenantAnalytics.create({
    data: {
      tenantId,
      date: today,
      apiCallsCount: 1,
      totalRequests: 1,
      activeUsers: 0,
      webhookDeliveries: 0,
      errorCount: 0,
      avgResponseTimeMs: 0,
    },
  });
}

/**
 * Update feature usage tracking
 */
export async function trackFeatureUsage(
  tenantId: string,
  featureName: string,
  count: number = 1
) {
  const today = new Date().toISOString().split("T")[0];

  const analytics = await prisma.tenantAnalytics.findUnique({
    where: {
      tenantId_date: {
        tenantId,
        date: today,
      },
    },
  });

  const featureUsage = (analytics?.featureUsage ?? {}) as Record<string, number>;
  featureUsage[featureName] = (featureUsage[featureName] ?? 0) + count;

  if (analytics) {
    return await prisma.tenantAnalytics.update({
      where: {
        tenantId_date: {
          tenantId,
          date: today,
        },
      },
      data: {
        featureUsage,
      },
    });
  }

  return await prisma.tenantAnalytics.create({
    data: {
      tenantId,
      date: today,
      featureUsage,
      activeUsers: 0,
      totalRequests: 0,
      apiCallsCount: 0,
      webhookDeliveries: 0,
      errorCount: 0,
      avgResponseTimeMs: 0,
    },
  });
}

/**
 * Get API usage for billing/quota enforcement
 */
export async function getApiUsageForPeriod(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const analytics = await getTenantAnalytics(tenantId, startDate, endDate);

  return analytics.reduce((total, a) => total + (a.apiCallsCount ?? 0), 0);
}
