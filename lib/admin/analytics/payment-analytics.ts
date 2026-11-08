import { prisma } from "@/lib/prisma";

export interface PaymentMetrics {
  totalTransactions: number;
  totalVolume: number; // in euros
  avgPayout: number;
  failureRate: number; // as percentage
  totalFailures: number;
  fraudSignals: number;
  avgProcessingTime: number; // in hours
}

export interface PaymentFailure {
  reason: string;
  count: number;
  percentage: number;
  impact: number; // total value affected
}

export interface FraudSignal {
  type: string;
  severity: "low" | "medium" | "high";
  count: number;
  description: string;
}

/**
 * Payment and transaction analytics
 */
export class PaymentAnalyticsEngine {
  /**
   * Get overall payment metrics
   */
  async getPaymentMetrics(): Promise<PaymentMetrics> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Successful transactions in last 30 days
    const successful = await prisma.payment.findMany({
      where: {
        status: "SETTLED",
        settledAt: { gte: thirtyDaysAgo },
      },
      select: { amountCents: true, createdAt: true, settledAt: true },
    });

    // Failed transactions
    const failed = await prisma.payment.count({
      where: {
        status: "FAILED",
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // All transactions in period
    const total = await prisma.payment.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const totalVolume = successful.reduce((sum, p) => sum + p.amountCents, 0) / 100;
    const avgPayout = successful.length > 0 ? totalVolume / successful.length : 0;

    // Calculate average processing time
    const avgTime =
      successful.length > 0
        ? successful.reduce((sum, p) => {
            if (!p.settledAt) return sum;
            return sum + (p.settledAt.getTime() - p.createdAt.getTime()) / (1000 * 60 * 60);
          }, 0) / successful.length
        : 0;

    const failureRate = total > 0 ? (failed / total) * 100 : 0;

    // Get fraud signals
    const fraudSignals = await this.detectFraudSignals();

    return {
      totalTransactions: total,
      totalVolume: Math.round(totalVolume),
      avgPayout: Math.round(avgPayout * 100) / 100,
      failureRate: Math.round(failureRate * 10) / 10,
      totalFailures: failed,
      fraudSignals: fraudSignals.reduce((sum, s) => sum + s.count, 0),
      avgProcessingTime: Math.round(avgTime * 10) / 10,
    };
  }

  /**
   * Analyze payment failures
   */
  async getPaymentFailures(): Promise<PaymentFailure[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const failures = await prisma.payment.findMany({
      where: {
        status: "FAILED",
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        failureReason: true,
        amountCents: true,
      },
    });

    const failureMap = new Map<string, { count: number; impact: number }>();

    for (const failure of failures) {
      const reason = failure.failureReason || "Unknown";
      const current = failureMap.get(reason) ?? { count: 0, impact: 0 };
      failureMap.set(reason, {
        count: current.count + 1,
        impact: current.impact + failure.amountCents,
      });
    }

    const total = failures.length;
    const results: PaymentFailure[] = [];

    for (const [reason, data] of failureMap.entries()) {
      results.push({
        reason,
        count: data.count,
        percentage: (data.count / total) * 100,
        impact: Math.round(data.impact / 100),
      });
    }

    return results.sort((a, b) => b.count - a.count);
  }

  /**
   * Detect fraud signals in transactions
   */
  async detectFraudSignals(): Promise<FraudSignal[]> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const signals: FraudSignal[] = [];

    // Signal 1: Multiple rapid transactions from same user
    const rapidTransactions = await prisma.payment.groupBy({
      by: ["userId"],
      _count: true,
      where: {
        createdAt: { gte: twentyFourHoursAgo },
      },
      having: {
        _count: { gt: 10 },
      },
    });

    if (rapidTransactions.length > 0) {
      signals.push({
        type: "Rapid Transactions",
        severity: "medium",
        count: rapidTransactions.length,
        description: "Multiple transactions from same user in 24 hours",
      });
    }

    // Signal 2: Unusually large transaction
    const largeTransaction = await prisma.payment.count({
      where: {
        amountCents: { gte: 1000000 }, // > €10,000
        createdAt: { gte: sevenDaysAgo },
      },
    });

    if (largeTransaction > 0) {
      signals.push({
        type: "Large Transaction",
        severity: "low",
        count: largeTransaction,
        description: "Transactions over €10,000",
      });
    }

    // Signal 3: Abnormal failure pattern
    const failurePattern = await prisma.payment.groupBy({
      by: ["userId"],
      _count: true,
      where: {
        status: "FAILED",
        createdAt: { gte: twentyFourHoursAgo },
      },
      having: {
        _count: { gte: 3 },
      },
    });

    if (failurePattern.length > 0) {
      signals.push({
        type: "Repeated Failures",
        severity: "high",
        count: failurePattern.length,
        description: "Users with 3+ failed transactions in 24 hours",
      });
    }

    // Signal 4: Chargebacks or disputes
    const disputes = await prisma.payment.count({
      where: {
        status: "DISPUTED",
        createdAt: { gte: sevenDaysAgo },
      },
    });

    if (disputes > 0) {
      signals.push({
        type: "Chargebacks/Disputes",
        severity: "high",
        count: disputes,
        description: "Disputed transactions requiring investigation",
      });
    }

    return signals;
  }

  /**
   * Get payment distribution by amount
   */
  async getPaymentDistribution(): Promise<
    Array<{
      range: string;
      count: number;
      percentage: number;
      total: number;
    }>
  > {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const ranges = [
      { min: 0, max: 10000, label: "€0-€100" },
      { min: 10000, max: 50000, label: "€100-€500" },
      { min: 50000, max: 100000, label: "€500-€1000" },
      { min: 100000, max: 500000, label: "€1000-€5000" },
      { min: 500000, max: Infinity, label: "€5000+" },
    ];

    const results = [];

    for (const range of ranges) {
      const payments = await prisma.payment.aggregate({
        _count: true,
        _sum: { amountCents: true },
        where: {
          status: "SETTLED",
          amountCents: { gte: range.min, lt: range.max },
          settledAt: { gte: thirtyDaysAgo },
        },
      });

      const count = payments._count ?? 0;
      const total = (payments._sum.amountCents ?? 0) / 100;

      results.push({
        range: range.label,
        count,
        percentage: 0, // Will calculate after
        total: Math.round(total),
      });
    }

    // Calculate percentages
    const total = results.reduce((sum, r) => sum + r.count, 0);
    for (const r of results) {
      r.percentage = total > 0 ? (r.count / total) * 100 : 0;
    }

    return results;
  }

  /**
   * Get payment success rate trends
   */
  async getPaymentSuccessTrend(): Promise<
    Array<{
      date: string;
      successCount: number;
      failureCount: number;
      successRate: number;
    }>
  > {
    const now = new Date();
    const days = 30;
    const trends = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const [success, failure] = await Promise.all([
        prisma.payment.count({
          where: {
            status: "SETTLED",
            settledAt: { gte: dayStart, lt: dayEnd },
          },
        }),
        prisma.payment.count({
          where: {
            status: "FAILED",
            createdAt: { gte: dayStart, lt: dayEnd },
          },
        }),
      ]);

      const total = success + failure;
      const rate = total > 0 ? (success / total) * 100 : 100;

      trends.push({
        date: dayStart.toISOString().split("T")[0],
        successCount: success,
        failureCount: failure,
        successRate: Math.round(rate * 10) / 10,
      });
    }

    return trends;
  }

  /**
   * Get top payment routes (most common payment methods)
   */
  async getPaymentRoutes(): Promise<
    Array<{
      method: string;
      count: number;
      percentage: number;
      avgAmount: number;
      successRate: number;
    }>
  > {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const payments = await prisma.payment.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        method: true,
        status: true,
        amountCents: true,
      },
    });

    const methodMap = new Map<
      string,
      {
        count: number;
        success: number;
        totalAmount: number;
      }
    >();

    for (const p of payments) {
      const method = p.method || "Unknown";
      const current = methodMap.get(method) ?? { count: 0, success: 0, totalAmount: 0 };
      methodMap.set(method, {
        count: current.count + 1,
        success: current.success + (p.status === "SETTLED" ? 1 : 0),
        totalAmount: current.totalAmount + p.amountCents,
      });
    }

    const total = payments.length;
    const results = [];

    for (const [method, data] of methodMap.entries()) {
      results.push({
        method,
        count: data.count,
        percentage: (data.count / total) * 100,
        avgAmount: Math.round((data.totalAmount / data.count) * 100) / 10000,
        successRate: (data.success / data.count) * 100,
      });
    }

    return results.sort((a, b) => b.count - a.count);
  }
}
