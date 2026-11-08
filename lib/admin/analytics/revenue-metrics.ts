import { prisma } from "@/lib/prisma";
import { amsterdamStartOfDay } from "@/lib/time/amsterdam";

export interface RevenueMetrics {
  mrr: number; // Monthly Recurring Revenue
  arr: number; // Annual Recurring Revenue
  platformFeeRevenue: number; // Total platform fees
  payoutExpenses: number; // Total payouts
  grossMargin: number; // (revenue - payouts) / revenue
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
}

export interface DailyRevenueData {
  date: string;
  platformFees: number;
  payouts: number;
  netRevenue: number;
}

/**
 * Revenue metrics and financial analysis
 */
export class RevenueMetricsAnalyzer {
  /**
   * Get current MRR (Monthly Recurring Revenue) and related metrics
   */
  async getRevenueMetrics(): Promise<RevenueMetrics> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    const startOfDay = amsterdamStartOfDay(now);

    // Get revenue data for different periods
    const [monthlyFees, weeklyFees, dailyFees, monthlyPayouts, weeklyPayouts, dailyPayouts, activeSubscriptions] =
      await Promise.all([
        // Monthly platform fees (invoices)
        prisma.invoice.aggregate({
          _sum: { totalCents: true },
          where: {
            status: "PAID",
            createdAt: { gte: startOfMonth },
            issuerTenantId: undefined, // platform invoices only
          },
        }),

        // Weekly platform fees
        prisma.invoice.aggregate({
          _sum: { totalCents: true },
          where: {
            status: "PAID",
            createdAt: { gte: startOfWeek },
            issuerTenantId: undefined,
          },
        }),

        // Daily platform fees
        prisma.invoice.aggregate({
          _sum: { totalCents: true },
          where: {
            status: "PAID",
            createdAt: { gte: startOfDay },
            issuerTenantId: undefined,
          },
        }),

        // Monthly payouts
        prisma.payment.aggregate({
          _sum: { amountCents: true },
          where: {
            status: "SETTLED",
            settledAt: { gte: startOfMonth },
          },
        }),

        // Weekly payouts
        prisma.payment.aggregate({
          _sum: { amountCents: true },
          where: {
            status: "SETTLED",
            settledAt: { gte: startOfWeek },
          },
        }),

        // Daily payouts
        prisma.payment.aggregate({
          _sum: { amountCents: true },
          where: {
            status: "SETTLED",
            settledAt: { gte: startOfDay },
          },
        }),

        // Count of active subscriptions (employers with active shifts)
        prisma.tenant.count({
          where: {
            memberships: {
              some: {
                role: "HQ_ADMIN",
              },
            },
          },
        }),
      ]);

    const monthlyRevenueCents = monthlyFees._sum.totalCents ?? 0;
    const weeklyRevenueCents = weeklyFees._sum.totalCents ?? 0;
    const dailyRevenueCents = dailyFees._sum.totalCents ?? 0;
    const monthlyPayoutsCents = monthlyPayouts._sum.amountCents ?? 0;
    const weeklyPayoutsCents = weeklyPayouts._sum.amountCents ?? 0;
    const dailyPayoutsCents = dailyPayouts._sum.amountCents ?? 0;

    const monthlyRevenue = monthlyRevenueCents / 100;
    const weeklyRevenue = weeklyRevenueCents / 100;
    const dailyRevenue = dailyRevenueCents / 100;
    const monthlyPayouts = monthlyPayoutsCents / 100;

    // Simple MRR calculation: current month revenue
    const mrr = monthlyRevenue;
    const arr = mrr * 12;

    const grossMargin = monthlyRevenue > 0 ? ((monthlyRevenue - monthlyPayouts) / monthlyRevenue) * 100 : 0;

    return {
      mrr: Math.round(mrr),
      arr: Math.round(arr),
      platformFeeRevenue: Math.round(monthlyRevenue),
      payoutExpenses: Math.round(monthlyPayouts),
      grossMargin: Math.round(grossMargin * 10) / 10,
      dailyRevenue: Math.round(dailyRevenue),
      weeklyRevenue: Math.round(weeklyRevenue),
      monthlyRevenue: Math.round(monthlyRevenue),
    };
  }

  /**
   * Get daily revenue breakdown for a date range
   */
  async getDailyRevenueData(startDate: Date, endDate: Date): Promise<DailyRevenueData[]> {
    const days: DailyRevenueData[] = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const [feesResult, payoutsResult] = await Promise.all([
        prisma.invoice.aggregate({
          _sum: { totalCents: true },
          where: {
            status: "PAID",
            createdAt: { gte: dayStart, lt: dayEnd },
            issuerTenantId: undefined,
          },
        }),

        prisma.payment.aggregate({
          _sum: { amountCents: true },
          where: {
            status: "SETTLED",
            settledAt: { gte: dayStart, lt: dayEnd },
          },
        }),
      ]);

      const fees = (feesResult._sum.totalCents ?? 0) / 100;
      const payouts = (payoutsResult._sum.amountCents ?? 0) / 100;

      days.push({
        date: dayStart.toISOString().split("T")[0],
        platformFees: Math.round(fees),
        payouts: Math.round(payouts),
        netRevenue: Math.round(fees - payouts),
      });
    }

    return days;
  }

  /**
   * Get revenue growth rate (week-over-week, month-over-month)
   */
  async getRevenueGrowthRate(): Promise<{ wow: number; mom: number; yoy: number }> {
    const now = new Date();

    // Current week
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - now.getDay());
    currentWeekStart.setHours(0, 0, 0, 0);

    // Previous week
    const prevWeekStart = new Date(currentWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    // Current month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Previous month
    const prevMonthStart = new Date(currentMonthStart);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

    // Current year
    const currentYearStart = new Date(now.getFullYear(), 0, 1);

    // Previous year
    const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);

    const [currentWeekRev, prevWeekRev, currentMonthRev, prevMonthRev, currentYearRev, prevYearRev] = await Promise.all([
      prisma.invoice.aggregate({
        _sum: { totalCents: true },
        where: {
          status: "PAID",
          createdAt: { gte: currentWeekStart },
        },
      }),
      prisma.invoice.aggregate({
        _sum: { totalCents: true },
        where: {
          status: "PAID",
          createdAt: { gte: prevWeekStart, lt: currentWeekStart },
        },
      }),
      prisma.invoice.aggregate({
        _sum: { totalCents: true },
        where: {
          status: "PAID",
          createdAt: { gte: currentMonthStart },
        },
      }),
      prisma.invoice.aggregate({
        _sum: { totalCents: true },
        where: {
          status: "PAID",
          createdAt: { gte: prevMonthStart, lt: currentMonthStart },
        },
      }),
      prisma.invoice.aggregate({
        _sum: { totalCents: true },
        where: {
          status: "PAID",
          createdAt: { gte: currentYearStart },
        },
      }),
      prisma.invoice.aggregate({
        _sum: { totalCents: true },
        where: {
          status: "PAID",
          createdAt: { gte: prevYearStart, lt: currentYearStart },
        },
      }),
    ]);

    const calcGrowth = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const wowValue = (currentWeekRev._sum.totalCents ?? 0) / 100;
    const prevWowValue = (prevWeekRev._sum.totalCents ?? 0) / 100;
    const momValue = (currentMonthRev._sum.totalCents ?? 0) / 100;
    const prevMomValue = (prevMonthRev._sum.totalCents ?? 0) / 100;
    const yoyValue = (currentYearRev._sum.totalCents ?? 0) / 100;
    const prevYoyValue = (prevYearRev._sum.totalCents ?? 0) / 100;

    return {
      wow: Math.round(calcGrowth(wowValue, prevWowValue) * 10) / 10,
      mom: Math.round(calcGrowth(momValue, prevMomValue) * 10) / 10,
      yoy: Math.round(calcGrowth(yoyValue, prevYoyValue) * 10) / 10,
    };
  }

  /**
   * Get platform fee revenue breakdown by shift type
   */
  async getPlatformFeeBreakdown(): Promise<
    Array<{
      shiftType: string;
      revenue: number;
      count: number;
      avgFeePerShift: number;
    }>
  > {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const results = await prisma.shift.groupBy({
      by: ["type"],
      _sum: {
        platformFeeCents: true,
      },
      _count: true,
      where: {
        createdAt: { gte: monthStart },
      },
    });

    return results.map((r) => ({
      shiftType: r.type,
      revenue: Math.round((r._sum.platformFeeCents ?? 0) / 100),
      count: r._count,
      avgFeePerShift: Math.round((r._sum.platformFeeCents ?? 0) / r._count / 100),
    }));
  }
}
