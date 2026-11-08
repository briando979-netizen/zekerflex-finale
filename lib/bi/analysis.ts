import { prisma } from "@/lib/prisma";

export class BIAnalysis {
  async cohortAnalysis(startDate: Date, endDate: Date, bucketDays = 7) {
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: { freelancerShifts: true },
    });

    const cohorts: Record<string, { size: number; revenue: number; retention: number }> = {};

    for (const user of users) {
      const weekKey = `Week ${Math.floor((user.createdAt.getTime() - startDate.getTime()) / (bucketDays * 24 * 60 * 60 * 1000))}`;

      if (!cohorts[weekKey]) {
        cohorts[weekKey] = { size: 0, revenue: 0, retention: 0 };
      }

      cohorts[weekKey].size += 1;
      cohorts[weekKey].revenue += user.freelancerShifts.reduce((sum, s) => sum + (s.invoiceId ? 1 : 0), 0);
    }

    return cohorts;
  }

  async funnelAnalysis(stages: string[]) {
    const funnel: Record<string, number> = {};

    for (const stage of stages) {
      if (stage === "signup") {
        funnel[stage] = await prisma.user.count();
      } else if (stage === "profile_complete") {
        funnel[stage] = await prisma.freelancerProfile.count();
      } else if (stage === "first_shift") {
        funnel[stage] = await prisma.freelancerShift.count({
          where: { status: { not: "CANCELLED" } },
        });
      } else if (stage === "payment_received") {
        funnel[stage] = await prisma.invoice.count({
          where: { status: "PAID" },
        });
      }
    }

    const funnelWithConversion = Object.entries(funnel).map(([stage, count], index) => {
      const previousCount = index === 0 ? count : Object.values(funnel)[index - 1];
      const conversionRate = previousCount > 0 ? (count / previousCount) * 100 : 100;

      return {
        stage,
        users: count,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
      };
    });

    return funnelWithConversion;
  }

  async retentionCurve(startDate: Date, intervals = [7, 14, 30, 60, 90]) {
    const newUsers = await prisma.user.findMany({
      where: { createdAt: { gte: startDate, lte: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000) } },
    });

    const retentionByDay: Record<number, number> = {};

    for (const days of intervals) {
      const checkDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
      const retained = newUsers.filter((u) => u.lastLoginAt && u.lastLoginAt >= checkDate).length;

      const retentionRate = newUsers.length > 0 ? (retained / newUsers.length) * 100 : 0;
      retentionByDay[days] = parseFloat(retentionRate.toFixed(2));
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
