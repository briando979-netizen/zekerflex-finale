import { prisma } from "@/lib/prisma";

export interface GrowthMetrics {
  wow: number; // Week-over-week percentage
  mom: number; // Month-over-month percentage
  qoq: number; // Quarter-over-quarter percentage
  yoy: number; // Year-over-year percentage
}

export interface Anomaly {
  type: string;
  severity: "low" | "medium" | "high";
  metric: string;
  actualValue: number;
  expectedValue: number;
  deviation: number; // percentage
  date: string;
  description: string;
}

export interface Forecast {
  metric: string;
  period: string; // "1w", "1m", "3m"
  currentValue: number;
  forecastedValue: number;
  confidence: number; // 0-100
  trend: "increasing" | "decreasing" | "stable";
}

/**
 * Trend analysis, anomaly detection, and forecasting
 */
export class TrendAnalyzer {
  /**
   * Calculate growth rates across multiple timeframes
   */
  async getGrowthMetrics(metric: "revenue" | "users" | "transactions" | "payouts"): Promise<GrowthMetrics> {
    const now = new Date();

    // Week-over-week
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - now.getDay());
    currentWeekStart.setHours(0, 0, 0, 0);

    const prevWeekStart = new Date(currentWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    // Month-over-month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(currentMonthStart);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

    // Quarter-over-quarter
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const currentQuarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
    const prevQuarterStart = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);

    // Year-over-year
    const currentYearStart = new Date(now.getFullYear(), 0, 1);
    const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);

    let wow = 0,
      mom = 0,
      qoq = 0,
      yoy = 0;

    switch (metric) {
      case "revenue": {
        const [cw, pw, cm, pm, cq, pq, cy, py] = await Promise.all([
          this.getRevenueSum(currentWeekStart, now),
          this.getRevenueSum(prevWeekStart, currentWeekStart),
          this.getRevenueSum(currentMonthStart, now),
          this.getRevenueSum(prevMonthStart, currentMonthStart),
          this.getRevenueSum(currentQuarterStart, now),
          this.getRevenueSum(prevQuarterStart, currentQuarterStart),
          this.getRevenueSum(currentYearStart, now),
          this.getRevenueSum(prevYearStart, currentYearStart),
        ]);
        wow = this.calcGrowth(cw, pw);
        mom = this.calcGrowth(cm, pm);
        qoq = this.calcGrowth(cq, pq);
        yoy = this.calcGrowth(cy, py);
        break;
      }

      case "users": {
        const [cw, pw, cm, pm, cq, pq, cy, py] = await Promise.all([
          this.getUserCount(currentWeekStart, now),
          this.getUserCount(prevWeekStart, currentWeekStart),
          this.getUserCount(currentMonthStart, now),
          this.getUserCount(prevMonthStart, currentMonthStart),
          this.getUserCount(currentQuarterStart, now),
          this.getUserCount(prevQuarterStart, currentQuarterStart),
          this.getUserCount(currentYearStart, now),
          this.getUserCount(prevYearStart, currentYearStart),
        ]);
        wow = this.calcGrowth(cw, pw);
        mom = this.calcGrowth(cm, pm);
        qoq = this.calcGrowth(cq, pq);
        yoy = this.calcGrowth(cy, py);
        break;
      }

      case "transactions": {
        const [cw, pw, cm, pm, cq, pq, cy, py] = await Promise.all([
          this.getTransactionCount(currentWeekStart, now),
          this.getTransactionCount(prevWeekStart, currentWeekStart),
          this.getTransactionCount(currentMonthStart, now),
          this.getTransactionCount(prevMonthStart, currentMonthStart),
          this.getTransactionCount(currentQuarterStart, now),
          this.getTransactionCount(prevQuarterStart, currentQuarterStart),
          this.getTransactionCount(currentYearStart, now),
          this.getTransactionCount(prevYearStart, currentYearStart),
        ]);
        wow = this.calcGrowth(cw, pw);
        mom = this.calcGrowth(cm, pm);
        qoq = this.calcGrowth(cq, pq);
        yoy = this.calcGrowth(cy, py);
        break;
      }

      case "payouts": {
        const [cw, pw, cm, pm, cq, pq, cy, py] = await Promise.all([
          this.getPayoutSum(currentWeekStart, now),
          this.getPayoutSum(prevWeekStart, currentWeekStart),
          this.getPayoutSum(currentMonthStart, now),
          this.getPayoutSum(prevMonthStart, currentMonthStart),
          this.getPayoutSum(currentQuarterStart, now),
          this.getPayoutSum(prevQuarterStart, currentQuarterStart),
          this.getPayoutSum(currentYearStart, now),
          this.getPayoutSum(prevYearStart, currentYearStart),
        ]);
        wow = this.calcGrowth(cw, pw);
        mom = this.calcGrowth(cm, pm);
        qoq = this.calcGrowth(cq, pq);
        yoy = this.calcGrowth(cy, py);
        break;
      }
    }

    return {
      wow: Math.round(wow * 10) / 10,
      mom: Math.round(mom * 10) / 10,
      qoq: Math.round(qoq * 10) / 10,
      yoy: Math.round(yoy * 10) / 10,
    };
  }

  /**
   * Detect statistical anomalies in key metrics
   */
  async detectAnomalies(): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    const now = new Date();

    // Get last 30 days of data
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dailyData = [];

    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const revenue = await this.getRevenueSum(dayStart, dayEnd);
      const users = await this.getUserCount(dayStart, dayEnd);
      const transactions = await this.getTransactionCount(dayStart, dayEnd);

      dailyData.push({
        date: dayStart.toISOString().split("T")[0],
        revenue,
        users,
        transactions,
      });
    }

    // Calculate standard deviation and detect anomalies
    if (dailyData.length >= 3) {
      // Revenue anomaly
      const revenues = dailyData.map((d) => d.revenue);
      const avgRevenue = revenues.reduce((a, b) => a + b, 0) / revenues.length;
      const stdRevenue = Math.sqrt(
        revenues.reduce((sum, v) => sum + Math.pow(v - avgRevenue, 2), 0) / revenues.length
      );

      for (let i = 1; i < dailyData.length; i++) {
        const deviation = Math.abs(dailyData[i].revenue - avgRevenue) / (stdRevenue || 1);
        if (deviation > 2) {
          anomalies.push({
            type: "Revenue Spike/Drop",
            severity: deviation > 3 ? "high" : "medium",
            metric: "Daily Revenue",
            actualValue: dailyData[i].revenue,
            expectedValue: avgRevenue,
            deviation: ((dailyData[i].revenue - avgRevenue) / avgRevenue) * 100,
            date: dailyData[i].date,
            description: `Revenue ${dailyData[i].revenue > avgRevenue ? "spiked" : "dropped"} ${Math.abs(deviation).toFixed(1)}σ`,
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Forecast future metric values using simple trend projection
   */
  async generateForecasts(): Promise<Forecast[]> {
    const forecasts: Forecast[] = [];
    const now = new Date();

    // Get 90 days of historical data
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const dailyValues = [];

    for (let i = 89; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const revenue = await this.getRevenueSum(dayStart, dayEnd);
      dailyValues.push(revenue);
    }

    // Simple linear regression for trend
    const n = dailyValues.length;
    const avgX = (n - 1) / 2;
    const avgY = dailyValues.reduce((a, b) => a + b, 0) / n;

    let numerator = 0,
      denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - avgX) * (dailyValues[i] - avgY);
      denominator += (i - avgX) * (i - avgX);
    }

    const slope = denominator > 0 ? numerator / denominator : 0;
    const intercept = avgY - slope * avgX;

    // Forecast for 1 week, 1 month, 3 months
    const currentRevenue = dailyValues[n - 1];
    const forecasts30 = slope * n + intercept; // 30 days forward
    const forecasts90 = slope * (n + 60) + intercept; // 90 days forward

    forecasts.push({
      metric: "Revenue",
      period: "1m",
      currentValue: currentRevenue,
      forecastedValue: forecasts30,
      confidence: Math.min(85, 50 + dailyValues.length * 0.2),
      trend: slope > 0 ? "increasing" : slope < 0 ? "decreasing" : "stable",
    });

    forecasts.push({
      metric: "Revenue",
      period: "3m",
      currentValue: currentRevenue,
      forecastedValue: forecasts90,
      confidence: Math.min(75, 40 + dailyValues.length * 0.15),
      trend: slope > 0 ? "increasing" : slope < 0 ? "decreasing" : "stable",
    });

    return forecasts;
  }

  // Helper methods
  private async getRevenueSum(startDate: Date, endDate: Date): Promise<number> {
    const result = await prisma.invoice.aggregate({
      _sum: { totalCents: true },
      where: {
        status: "PAID",
        createdAt: { gte: startDate, lt: endDate },
      },
    });
    return (result._sum.totalCents ?? 0) / 100;
  }

  private async getPayoutSum(startDate: Date, endDate: Date): Promise<number> {
    const result = await prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        status: "SETTLED",
        settledAt: { gte: startDate, lt: endDate },
      },
    });
    return (result._sum.amountCents ?? 0) / 100;
  }

  private async getUserCount(startDate: Date, endDate: Date): Promise<number> {
    return prisma.user.count({
      where: {
        createdAt: { gte: startDate, lt: endDate },
      },
    });
  }

  private async getTransactionCount(startDate: Date, endDate: Date): Promise<number> {
    return prisma.payment.count({
      where: {
        createdAt: { gte: startDate, lt: endDate },
      },
    });
  }

  private calcGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }
}
