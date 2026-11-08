import { prisma } from "@/lib/prisma";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { z } from "zod";
import { FunnelAnalyzer } from "@/lib/admin/analytics/funnel-analyzer";
import { RevenueMetricsAnalyzer } from "@/lib/admin/analytics/revenue-metrics";
import { UserAnalyticsEngine } from "@/lib/admin/analytics/user-analytics";

export const KPISchema = z.object({
  metric: z.string(),
  value: z.number(),
  trend: z.number().optional(), // % change
  target: z.number().optional(),
  status: z.enum(["on-track", "warning", "critical"]).optional(),
  timestamp: z.date(),
});

export type KPI = z.infer<typeof KPISchema>;

export class MetricsEngine {
  private funnelAnalyzer: FunnelAnalyzer;
  private revenueAnalyzer: RevenueMetricsAnalyzer;
  private userAnalytics: UserAnalyticsEngine;

  constructor() {
    this.funnelAnalyzer = new FunnelAnalyzer();
    this.revenueAnalyzer = new RevenueMetricsAnalyzer();
    this.userAnalytics = new UserAnalyticsEngine();
  }

  async calculateRevenueKPIs(startDate: Date, endDate: Date) {
    const invoices = await prisma.invoice.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
    });

    const total = invoices.reduce((sum, inv) => sum + (inv.amountCents ?? 0), 0) / 100;
    const count = invoices.length;
    const average = count > 0 ? total / count : 0;

    const metrics = await this.revenueAnalyzer.getRevenueMetrics();

    return {
      totalRevenue: total,
      invoiceCount: count,
      averageInvoiceValue: average,
      trend: await this.calculateTrend("revenue", startDate, endDate),
      mrr: metrics.mrr,
      platformFeeRevenue: metrics.platformFeeRevenue,
    };
  }

  async calculateUserKPIs(startDate: Date, endDate: Date) {
    const newUsers = await prisma.user.count({
      where: { createdAt: { gte: startDate, lte: endDate } },
    });

    const activeUsers = await prisma.user.count({
      where: { lastLoginAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });

    const totalUsers = await prisma.user.count();
    const userMetrics = await this.userAnalytics.getUserMetrics();

    return {
      newUsers,
      activeUsers: userMetrics.activeUsers,
      totalUsers,
      churnRate: await this.calculateChurnRate(endDate),
      retention: userMetrics.retention,
    };
  }

  async calculateConversionKPIs(startDate: Date, endDate: Date) {
    const employerFunnel = await this.funnelAnalyzer.getEmployerFunnel(30);

    return {
      offersCreated: employerFunnel.totalEntrants,
      offersAccepted: employerFunnel.totalConverted,
      conversionRate: parseFloat(employerFunnel.overallConversionRate.toFixed(2)),
      funnelStages: employerFunnel.stages,
    };
  }

  async calculateCohortRetention(cohortDate: Date, daysBack = 90) {
    const cohortUsers = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: new Date(cohortDate.getTime() - daysBack * 24 * 60 * 60 * 1000),
          lte: cohortDate,
        },
      },
    });

    const retained = cohortUsers.filter(
      (u) => u.lastLoginAt && u.lastLoginAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ).length;

    const retentionRate = cohortUsers.length > 0 ? (retained / cohortUsers.length) * 100 : 0;

    return {
      cohortSize: cohortUsers.length,
      retainedCount: retained,
      retentionRate: parseFloat(retentionRate.toFixed(2)),
    };
  }

  async calculateLTV(freelancerId: string) {
    const shifts = await prisma.freelancerShift.findMany({
      where: { freelancerId, status: "COMPLETED" },
      include: { invoice: true },
    });

    const totalValue = shifts.reduce((sum, shift) => sum + (shift.invoice?.amountCents ?? 0), 0) / 100;
    const transactionCount = shifts.length;
    const avgValue = transactionCount > 0 ? totalValue / transactionCount : 0;

    return {
      lifetimeValue: totalValue,
      transactionCount,
      averageTransactionValue: avgValue,
    };
  }

  async calculateCAC(startDate: Date, endDate: Date) {
    const marketingCost = 5000; // placeholder: track actual marketing spend
    const newCustomers = await prisma.user.count({
      where: { createdAt: { gte: startDate, lte: endDate }, role: "EMPLOYER" },
    });

    const cac = newCustomers > 0 ? marketingCost / newCustomers : 0;

    return {
      customerAcquisitionCost: parseFloat(cac.toFixed(2)),
      newCustomers,
      marketingSpend: marketingCost,
    };
  }

  async detectAnomalies(metric: string, windowDays = 30): Promise<boolean> {
    const data = await prisma.metricSnapshot.findMany({
      where: { name: metric, recordedAt: { gte: new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000) } },
      orderBy: { recordedAt: "asc" },
    });

    if (data.length < 5) return false;

    const values = data.map((d) => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const lastValue = values[values.length - 1];
    const zScore = Math.abs((lastValue - mean) / stdDev);

    return zScore > 2; // anomaly if z-score > 2
  }

  private async calculateTrend(metric: string, startDate: Date, endDate: Date): Promise<number> {
    const midpoint = new Date((startDate.getTime() + endDate.getTime()) / 2);
    const firstHalf = await this.aggregateMetric(metric, startDate, midpoint);
    const secondHalf = await this.aggregateMetric(metric, midpoint, endDate);

    if (firstHalf === 0) return 0;
    return ((secondHalf - firstHalf) / firstHalf) * 100;
  }

  private async aggregateMetric(metric: string, startDate: Date, endDate: Date): Promise<number> {
    if (metric === "revenue") {
      const invoices = await prisma.invoice.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
      });
      return invoices.reduce((sum, inv) => sum + (inv.amountCents ?? 0), 0) / 100;
    }
    return 0;
  }

  private async calculateChurnRate(endDate: Date): Promise<number> {
    const thirtyDaysAgo = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const churned = await prisma.user.count({
      where: { lastLoginAt: { lt: thirtyDaysAgo }, role: "FREELANCER" },
    });

    const total = await prisma.user.count({ where: { role: "FREELANCER" } });
    return total > 0 ? (churned / total) * 100 : 0;
  }
}
