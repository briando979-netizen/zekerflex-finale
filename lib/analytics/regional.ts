import type { RegionCode } from "@/lib/i18n/global/detector";

export interface RegionalMetrics {
  region: RegionCode;
  activeUsers: number;
  totalRevenue: number;
  avgOrderValue: number;
  conversionRate: number;
  churnRate: number;
  topPaymentMethod: string;
  topFeature: string;
  growthRate: number;
  timestamp: Date;
}

export interface RegionalDashboard {
  region: RegionCode;
  name: string;
  metrics: RegionalMetrics;
  topCities: Array<{ city: string; users: number }>;
  topLanguages: Array<{ language: string; usage: number }>;
  paymentDistribution: Record<string, number>;
  deviceDistribution: Record<string, number>;
}

export class RegionalAnalytics {
  async getMetrics(region: RegionCode): Promise<RegionalMetrics> {
    return {
      region,
      activeUsers: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      conversionRate: 0,
      churnRate: 0,
      topPaymentMethod: "stripe",
      topFeature: "dashboard",
      growthRate: 0,
      timestamp: new Date(),
    };
  }

  async getDashboard(region: RegionCode): Promise<RegionalDashboard> {
    const metrics = await this.getMetrics(region);

    return {
      region,
      name: `Regional Dashboard - ${region}`,
      metrics,
      topCities: [],
      topLanguages: [],
      paymentDistribution: {},
      deviceDistribution: {
        mobile: 0.65,
        desktop: 0.30,
        tablet: 0.05,
      },
    };
  }

  async compareRegions(regions: RegionCode[]): Promise<RegionalMetrics[]> {
    return Promise.all(regions.map(r => this.getMetrics(r)));
  }

  async getGrowthTrend(region: RegionCode, days: number): Promise<Array<{ date: string; value: number }>> {
    const trend = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      trend.push({
        date: date.toISOString().split("T")[0],
        value: Math.random() * 100,
      });
    }

    return trend;
  }

  async predictChurn(region: RegionCode): Promise<number> {
    return Math.random() * 0.1;
  }

  async getCohortsAnalysis(region: RegionCode): Promise<
    Array<{ cohort: string; retention: Record<string, number> }>
  > {
    return [
      {
        cohort: "January 2024",
        retention: {
          week1: 0.95,
          week2: 0.85,
          week3: 0.75,
          week4: 0.65,
        },
      },
    ];
  }
}

export function getRegionalAnalytics(): RegionalAnalytics {
  return new RegionalAnalytics();
}
