import { prisma } from "@/lib/prisma";
import { amsterdamStartOfDay } from "@/lib/time/amsterdam";

export interface RealTimeKPIs {
  activeShifts: number;
  activeApplications: number;
  totalPayoutsToday: number;
  totalRevenueToday: number;
  activeUsers: {
    freelancers: number;
    employers: number;
  };
  timestamp: Date;
}

export interface KPITrend {
  current: number;
  previous: number;
  percentChange: number;
  trend: "up" | "down" | "stable";
}

/**
 * Real-time KPI tracking for the admin dashboard.
 * Computes current state and trends vs previous periods.
 */
export class KPITracker {
  /**
   * Get real-time KPIs for immediate dashboard display
   */
  async getRealTimeKPIs(): Promise<RealTimeKPIs> {
    const now = new Date();
    const today = amsterdamStartOfDay(now);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [
      activeShifts,
      pendingApplications,
      payoutsTodayRaw,
      revenueTodayRaw,
      freelancerCount,
      employerCount,
    ] = await Promise.all([
      // Active shifts (not completed, not cancelled)
      prisma.shift.count({
        where: {
          status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
        },
      }),

      // Pending applications (not responded to)
      prisma.shiftAssignment.count({
        where: {
          status: "PENDING",
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      }),

      // Payouts today
      prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: {
          status: "SETTLED",
          settledAt: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
        },
      }),

      // Revenue (platform fees) today
      prisma.invoice.aggregate({
        _sum: { totalCents: true },
        where: {
          issuerTenantId: undefined, // platform invoice
          status: "PAID",
          createdAt: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
        },
      }),

      // Active freelancers (had activity in last 7 days)
      prisma.user.count({
        where: {
          role: "FREELANCER",
          lastSeenAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),

      // Active employers (had activity in last 7 days)
      prisma.user.count({
        where: {
          role: "HQ_ADMIN",
          lastSeenAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const payoutsCents = payoutsTodayRaw._sum.amountCents ?? 0;
    const revenueCents = revenueTodayRaw._sum.totalCents ?? 0;

    return {
      activeShifts,
      activeApplications: pendingApplications,
      totalPayoutsToday: Math.round(payoutsCents / 100),
      totalRevenueToday: Math.round(revenueCents / 100),
      activeUsers: {
        freelancers: freelancerCount,
        employers: employerCount,
      },
      timestamp: now,
    };
  }

  /**
   * Get KPI trend: current vs previous period
   */
  async getKPITrend(
    metric: "activeShifts" | "revenue" | "payouts" | "applications",
    days: number = 7
  ): Promise<KPITrend> {
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousStart = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);
    const previousEnd = currentStart;

    let currentValue = 0;
    let previousValue = 0;

    switch (metric) {
      case "revenue": {
        const [current, previous] = await Promise.all([
          prisma.invoice.aggregate({
            _sum: { totalCents: true },
            where: { status: "PAID", createdAt: { gte: currentStart, lte: now } },
          }),
          prisma.invoice.aggregate({
            _sum: { totalCents: true },
            where: { status: "PAID", createdAt: { gte: previousStart, lt: previousEnd } },
          }),
        ]);
        currentValue = (current._sum.totalCents ?? 0) / 100;
        previousValue = (previous._sum.totalCents ?? 0) / 100;
        break;
      }

      case "payouts": {
        const [current, previous] = await Promise.all([
          prisma.payment.aggregate({
            _sum: { amountCents: true },
            where: { status: "SETTLED", settledAt: { gte: currentStart, lte: now } },
          }),
          prisma.payment.aggregate({
            _sum: { amountCents: true },
            where: { status: "SETTLED", settledAt: { gte: previousStart, lt: previousEnd } },
          }),
        ]);
        currentValue = (current._sum.amountCents ?? 0) / 100;
        previousValue = (previous._sum.amountCents ?? 0) / 100;
        break;
      }

      case "activeShifts": {
        const [current, previous] = await Promise.all([
          prisma.shift.count({
            where: {
              status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
              createdAt: { gte: currentStart, lte: now },
            },
          }),
          prisma.shift.count({
            where: {
              status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
              createdAt: { gte: previousStart, lt: previousEnd },
            },
          }),
        ]);
        currentValue = current;
        previousValue = previous;
        break;
      }

      case "applications": {
        const [current, previous] = await Promise.all([
          prisma.shiftAssignment.count({
            where: {
              status: "PENDING",
              createdAt: { gte: currentStart, lte: now },
            },
          }),
          prisma.shiftAssignment.count({
            where: {
              status: "PENDING",
              createdAt: { gte: previousStart, lt: previousEnd },
            },
          }),
        ]);
        currentValue = current;
        previousValue = previous;
        break;
      }
    }

    const percentChange =
      previousValue === 0
        ? currentValue > 0
          ? 100
          : 0
        : ((currentValue - previousValue) / previousValue) * 100;

    return {
      current: Math.round(currentValue),
      previous: Math.round(previousValue),
      percentChange: Math.round(percentChange * 10) / 10,
      trend: percentChange > 5 ? "up" : percentChange < -5 ? "down" : "stable",
    };
  }

  /**
   * Get hourly data for a specific metric over the last 24 hours
   */
  async getHourlyData(metric: "revenue" | "payouts" | "applications"): Promise<Array<{ hour: number; value: number }>> {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const hourlyData: Array<{ hour: number; value: number }> = [];

    for (let hour = 0; hour < 24; hour++) {
      const hourStart = new Date(today);
      hourStart.setHours(hour, 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hour + 1, 0, 0, 0);

      let value = 0;

      switch (metric) {
        case "revenue": {
          const result = await prisma.invoice.aggregate({
            _sum: { totalCents: true },
            where: {
              status: "PAID",
              createdAt: { gte: hourStart, lt: hourEnd },
            },
          });
          value = Math.round((result._sum.totalCents ?? 0) / 100);
          break;
        }

        case "payouts": {
          const result = await prisma.payment.aggregate({
            _sum: { amountCents: true },
            where: {
              status: "SETTLED",
              settledAt: { gte: hourStart, lt: hourEnd },
            },
          });
          value = Math.round((result._sum.amountCents ?? 0) / 100);
          break;
        }

        case "applications": {
          value = await prisma.shiftAssignment.count({
            where: {
              status: "PENDING",
              createdAt: { gte: hourStart, lt: hourEnd },
            },
          });
          break;
        }
      }

      hourlyData.push({ hour, value });
    }

    return hourlyData;
  }
}
