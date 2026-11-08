import { prisma } from "@/lib/prisma";
import { FunnelAnalyzer } from "@/lib/admin/analytics/funnel-analyzer";
import { UserAnalyticsEngine } from "@/lib/admin/analytics/user-analytics";

export class BIAnalysis {
  private funnelAnalyzer: FunnelAnalyzer;
  private userAnalytics: UserAnalyticsEngine;

  constructor() {
    this.funnelAnalyzer = new FunnelAnalyzer();
    this.userAnalytics = new UserAnalyticsEngine();
  }

  async cohortAnalysis(startDate: Date, endDate: Date, bucketDays = 7) {
    const cohorts = await this.userAnalytics.getRetentionCohorts();

    const result: Record<string, { size: number; revenue: number; retention: number }> = {};

    for (const cohort of cohorts) {
      result[cohort.cohortDate] = {
        size: cohort.day0,
        revenue: cohort.day7,
        retention: cohort.day0 > 0 ? (cohort.day7 / cohort.day0) * 100 : 0,
      };
    }

    return result;
  }

  async funnelAnalysis(stages: string[]) {
    const funnel = await this.funnelAnalyzer.getEmployerFunnel(30);

    return funnel.stages.map((stage) => ({
      stage: stage.name,
      users: stage.value,
      conversionRate: parseFloat(stage.conversionRate.toFixed(2)),
    }));
  }

  async retentionCurve(startDate: Date, intervals = [7, 14, 30, 60, 90]) {
    const cohorts = await this.userAnalytics.getRetentionCohorts();
    const retentionByDay: Record<number, number> = {};

    if (cohorts.length > 0) {
      const firstCohort = cohorts[0];
      const day0 = firstCohort.day0 || 1;

      retentionByDay[0] = 100;
      retentionByDay[7] = (firstCohort.day7 / day0) * 100;
      retentionByDay[14] = (firstCohort.day14 / day0) * 100;
      retentionByDay[30] = (firstCohort.day30 / day0) * 100;
      retentionByDay[60] = (firstCohort.day60 / day0) * 100;
    }

    return retentionByDay;
  }

  async unitEconomics(freelancerId: string) {
    const shifts = await prisma.freelancerShift.findMany({
      where: { freelancerId, status: "COMPLETED" },
      include: { invoice: true },
    });

    const totalRevenue = shifts.reduce((sum, s) => sum + (s.invoice?.amountCents ?? 0), 0) / 100;
    const totalHours = shifts.reduce((sum, s) => sum + (s.durationMinutes ?? 0) / 60, 0);
    const revenuePerHour = totalHours > 0 ? totalRevenue / totalHours : 0;

    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: freelancerId },
    });

    const costs = freelancer?.hourlyRate ?? 0;
    const margin = revenuePerHour - costs;
    const marginPercent = revenuePerHour > 0 ? (margin / revenuePerHour) * 100 : 0;

    return {
      revenuePerHour,
      costPerHour: costs,
      marginPerHour: margin,
      marginPercent: parseFloat(marginPercent.toFixed(2)),
      totalRevenue,
      totalHours,
    };
  }

  async churnAnalysis(window = 30) {
    const activeUsers = await prisma.user.count({
      where: { lastLoginAt: { gte: new Date(Date.now() - window * 24 * 60 * 60 * 1000) } },
    });

    const inactiveUsers = await prisma.user.count({
      where: { lastLoginAt: { lt: new Date(Date.now() - window * 24 * 60 * 60 * 1000) } },
    });

    const total = activeUsers + inactiveUsers;
    const churnRate = total > 0 ? (inactiveUsers / total) * 100 : 0;

    return {
      activeUsers,
      inactiveUsers,
      churnRate: parseFloat(churnRate.toFixed(2)),
      windowDays: window,
    };
  }

  async segmentAnalysis() {
    const byRole = await prisma.user.groupBy({
      by: ["role"],
      _count: { id: true },
    });

    const byVerification = await prisma.user.groupBy({
      by: ["emailVerified"],
      _count: { id: true },
    });

    return {
      byRole: Object.fromEntries(byRole.map((g) => [g.role, g._count.id])),
      byVerification: Object.fromEntries(byVerification.map((g) => [g.emailVerified ? "verified" : "unverified", g._count.id])),
    };
  }
}
