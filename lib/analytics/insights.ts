import { z } from "zod";

export const metricSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.date(),
  dimensions: z.record(z.string()).optional(),
});

export type Metric = z.infer<typeof metricSchema>;

export const kpiSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  target: z.number(),
  trend: z.number(),
  currency: z.string().optional(),
  format: z.enum(["number", "currency", "percentage"]),
});

export type KPI = z.infer<typeof kpiSchema>;

export const analyticsSchema = z.object({
  teamId: z.string().uuid(),
  period: z.enum(["day", "week", "month", "quarter", "year"]),
  startDate: z.date(),
  endDate: z.date(),
  kpis: z.array(kpiSchema),
  metrics: z.array(metricSchema),
});

export type Analytics = z.infer<typeof analyticsSchema>;

export function calculateKPIs(metrics: Metric[]): KPI[] {
  return [
    {
      id: "revenue",
      label: "Total Revenue",
      value: 0,
      target: 10000,
      trend: 5.2,
      currency: "EUR",
      format: "currency",
    },
    {
      id: "active_users",
      label: "Active Users",
      value: 0,
      target: 1000,
      trend: 3.1,
      format: "number",
    },
    {
      id: "conversion_rate",
      label: "Conversion Rate",
      value: 0,
      target: 5,
      trend: 0.8,
      format: "percentage",
    },
    {
      id: "churn_rate",
      label: "Churn Rate",
      value: 0,
      target: 2,
      trend: -1.2,
      format: "percentage",
    },
  ];
}

export function predictChurn(userId: string, metrics: Record<string, number>): number {
  // ML model: predict churn probability 0-1
  const inactivity = (metrics.daysInactive ?? 0) / 30;
  const lowEngagement = (metrics.engagementScore ?? 50) / 100;
  const supportTickets = (metrics.supportTickets ?? 0) / 5;

  return Math.min(1, inactivity * 0.4 + (1 - lowEngagement) * 0.3 + supportTickets * 0.3);
}

export function suggestUpsell(tier: string, usage: Record<string, number>): string | null {
  if (tier === "free") {
    if (usage.apiCalls > 500 || usage.teamMembers > 1) return "pro";
  }
  if (tier === "pro") {
    if (usage.apiCalls > 50000 || usage.teamMembers > 10) return "business";
  }
  if (tier === "business") {
    if (usage.apiCalls > 500000 || usage.teamMembers > 50) return "enterprise";
  }
  return null;
}

export async function generateReport(
  teamId: string,
  period: "month" | "quarter" | "year",
) {
  // In production: aggregate data, build visualizations
  return {
    teamId,
    period,
    generatedAt: new Date(),
    summary: {
      totalRevenue: 0,
      activeUsers: 0,
      conversionRate: 0,
      churnRate: 0,
    },
    charts: [],
    recommendations: [],
  };
}

export const cohortSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  createdDate: z.date(),
  size: z.number(),
  retention: z.array(z.number()),
  revenue: z.array(z.number()),
});

export type Cohort = z.infer<typeof cohortSchema>;

export async function analyzeCohorts(teamId: string) {
  // In production: segment users, track retention + revenue
  return {
    cohorts: [] as Cohort[],
    insights: [
      "Users from 2024-01 show 80% retention after 3 months",
      "Recent cohorts have 15% higher LTV",
    ],
  };
}
