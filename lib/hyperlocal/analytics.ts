import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { LocalMetrics } from "@prisma/client";

// ---------------------------------------------------------------------------
// Local Analytics: Hyperlocal demand forecasting, heatmaps, competitive
// analysis, and expansion recommendations
// ---------------------------------------------------------------------------

export const HyperlocalMetricsSchema = z.object({
  geoZoneId: z.string(),
  date: z.date(),
  orderCount: z.number().int().nonnegative(),
  averageOrderValue: z.number().nonnegative(),
  totalRevenue: z.number().nonnegative(),
  fulfillmentRate: z.number().min(0).max(100),
  hotspotScore: z.number().min(0).max(100),
});

export type HyperlocalMetrics = z.infer<typeof HyperlocalMetricsSchema>;

export const DemandForecastSchema = z.object({
  geoZoneId: z.string(),
  date: z.date(),
  expectedOrderCount: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  factors: z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    season: z.enum(["SPRING", "SUMMER", "FALL", "WINTER"]),
    localEvents: z.string().array().optional(),
    weather: z.string().optional(),
  }),
});

export type DemandForecast = z.infer<typeof DemandForecastSchema>;

export const CompetitiveAnalysisSchema = z.object({
  geoZoneId: z.string(),
  competitorCount: z.number().int().nonnegative(),
  averagePrice: z.number().nonnegative(),
  averageDeliveryTime: z.number().int().positive(),
  marketShare: z.number().min(0).max(100),
  pricePosition: z.enum(["PREMIUM", "COMPETITIVE", "VALUE"]),
});

export type CompetitiveAnalysis = z.infer<typeof CompetitiveAnalysisSchema>;

export const ExpansionRecommendationSchema = z.object({
  geoZoneId: z.string(),
  recommendationType: z.enum([
    "EXPAND_ZONE",
    "ADD_WAREHOUSE",
    "INCREASE_PARTNERS",
    "OPTIMIZE_PRICING",
    "CONSOLIDATE",
  ]),
  confidence: z.number().min(0).max(1),
  expectedImpact: z.object({
    revenueIncrease: z.number().nonnegative(),
    customerGrowth: z.number().nonnegative(),
    roi: z.number(),
  }),
  actionItems: z.string().array(),
});

export type ExpansionRecommendation = z.infer<
  typeof ExpansionRecommendationSchema
>;

/**
 * Calculate hourly demand metrics for a geo zone
 */
export async function getHourlyDemandMetrics(
  geoZoneId: string,
  date: Date
): Promise<
  Array<{
    hour: number;
    orderCount: number;
    averageOrderValue: number;
    fulfillmentRate: number;
  }>
> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const metrics = await prisma.localMetrics.findMany({
    where: {
      geoZoneId,
      date: {
        gte: startOfDay,
        lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
      },
      hour: { not: null },
    },
    orderBy: { hour: "asc" },
  });

  return metrics.map((m) => ({
    hour: m.hour || 0,
    orderCount: m.orderCount,
    averageOrderValue: m.averageOrderValue,
    fulfillmentRate: m.fulfillmentRate,
  }));
}

/**
 * Get daily metrics summary
 */
export async function getDailyMetricsSummary(
  geoZoneId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  averageFulfillmentRate: number;
  topHours: Array<{ hour: number; orders: number }>;
}> {
  const metrics = await prisma.localMetrics.findMany({
    where: {
      geoZoneId,
      date: {
        gte: startDate,
        lte: endDate,
      },
      hour: null, // Daily aggregates
    },
  });

  let totalOrders = 0;
  let totalRevenue = 0;
  let fulfillmentRates: number[] = [];

  for (const m of metrics) {
    totalOrders += m.orderCount;
    totalRevenue += m.totalRevenue;
    if (m.fulfillmentRate > 0) {
      fulfillmentRates.push(m.fulfillmentRate);
    }
  }

  const averageFulfillmentRate =
    fulfillmentRates.length > 0
      ? fulfillmentRates.reduce((a, b) => a + b, 0) / fulfillmentRates.length
      : 0;

  // Get top hours
  const hourlyMetrics = await prisma.localMetrics.findMany({
    where: {
      geoZoneId,
      date: {
        gte: startDate,
        lte: endDate,
      },
      hour: { not: null },
    },
  });

  const topHours = hourlyMetrics
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 5)
    .map((m) => ({
      hour: m.hour || 0,
      orders: m.orderCount,
    }));

  return {
    totalOrders,
    totalRevenue,
    averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    averageFulfillmentRate,
    topHours,
  };
}

/**
 * Forecast demand for next 7 days using simple moving average
 */
export async function forecastDemandNext7Days(
  geoZoneId: string
): Promise<DemandForecast[]> {
  // Get last 30 days of data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const historicalData = await prisma.localMetrics.findMany({
    where: {
      geoZoneId,
      date: {
        gte: thirtyDaysAgo,
      },
      hour: null, // Use daily aggregates
    },
    orderBy: { date: "asc" },
  });

  const forecasts: DemandForecast[] = [];
  const movingAverage =
    historicalData.length > 0
      ? historicalData.reduce((sum, m) => sum + m.orderCount, 0) /
        Math.min(7, historicalData.length)
      : 0;

  for (let i = 0; i < 7; i++) {
    const forecastDate = new Date();
    forecastDate.setDate(forecastDate.getDate() + i + 1);

    const dayOfWeek = forecastDate.getDay();
    const month = forecastDate.getMonth();

    // Simple seasonal adjustment
    const seasonalFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 1.2 : 0.95; // Weekend boost

    const season = getSeasonFromMonth(month);

    forecasts.push({
      geoZoneId,
      date: forecastDate,
      expectedOrderCount: Math.ceil(movingAverage * seasonalFactor),
      confidence: 0.7,
      factors: {
        dayOfWeek,
        season,
      },
    });
  }

  return forecasts;
}

/**
 * Get season from month number
 */
function getSeasonFromMonth(month: number): "SPRING" | "SUMMER" | "FALL" | "WINTER" {
  if (month >= 2 && month <= 4) return "SPRING";
  if (month >= 5 && month <= 7) return "SUMMER";
  if (month >= 8 && month <= 10) return "FALL";
  return "WINTER";
}

/**
 * Calculate competitive positioning
 */
export async function analyzeCompetitivePosition(
  geoZoneId: string
): Promise<CompetitiveAnalysis> {
  const zone = await prisma.geoZone.findUniqueOrThrow({
    where: { id: geoZoneId },
  });

  const recentMetrics = await prisma.localMetrics.findMany({
    where: {
      geoZoneId,
      date: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
  });

  const totalRevenue = recentMetrics.reduce((sum, m) => sum + m.totalRevenue, 0);
  const avgPrice =
    recentMetrics.length > 0
      ? totalRevenue / recentMetrics.reduce((sum, m) => sum + m.orderCount, 0)
      : 0;

  // Competitive factor: assume 3-5 competitors in zone
  const competitorCount = Math.floor(zone.radiusMeters / 3000); // ~1 competitor per 3km

  // Determine market share (placeholder)
  const zoneMetrics = recentMetrics.reduce(
    (sum, m) => sum + m.orderCount,
    0
  );
  const estimatedMarketOrders = zoneMetrics / 0.25; // Assume 25% market share
  const marketShare = (zoneMetrics / estimatedMarketOrders) * 100;

  let pricePosition: CompetitiveAnalysis["pricePosition"];
  if (avgPrice > 25) pricePosition = "PREMIUM";
  else if (avgPrice > 15) pricePosition = "COMPETITIVE";
  else pricePosition = "VALUE";

  return {
    geoZoneId,
    competitorCount: Math.max(1, competitorCount),
    averagePrice: Math.round(avgPrice),
    averageDeliveryTime: zone.maxDeliveryTime,
    marketShare: Math.min(100, marketShare),
    pricePosition,
  };
}

/**
 * Generate expansion recommendations
 */
export async function generateExpansionRecommendations(
  geoZoneId: string
): Promise<ExpansionRecommendation[]> {
  const metrics = await getDailyMetricsSummary(
    geoZoneId,
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    new Date()
  );

  const forecast = await forecastDemandNext7Days(geoZoneId);
  const competitive = await analyzeCompetitivePosition(geoZoneId);

  const recommendations: ExpansionRecommendation[] = [];

  // Recommendation 1: High demand growth
  if (metrics.totalOrders > 1000) {
    recommendations.push({
      geoZoneId,
      recommendationType: "ADD_WAREHOUSE",
      confidence: 0.85,
      expectedImpact: {
        revenueIncrease: 30000, // €300
        customerGrowth: 15,
        roi: 2.5,
      },
      actionItems: [
        "Scout 2-3 potential warehouse locations",
        "Negotiate lease agreements",
        "Set up inventory management",
      ],
    });
  }

  // Recommendation 2: High fulfillment rate
  if (metrics.averageFulfillmentRate > 95) {
    recommendations.push({
      geoZoneId,
      recommendationType: "EXPAND_ZONE",
      confidence: 0.8,
      expectedImpact: {
        revenueIncrease: 50000, // €500
        customerGrowth: 25,
        roi: 3.0,
      },
      actionItems: [
        "Increase service radius by 2-3km",
        "Onboard additional delivery partners",
        "Update service area marketing",
      ],
    });
  }

  // Recommendation 3: Price optimization
  if (competitive.pricePosition === "VALUE" && metrics.totalOrders > 500) {
    recommendations.push({
      geoZoneId,
      recommendationType: "OPTIMIZE_PRICING",
      confidence: 0.75,
      expectedImpact: {
        revenueIncrease: 25000, // €250
        customerGrowth: 0,
        roi: 5.0,
      },
      actionItems: [
        "Analyze competitor pricing",
        "Test 10-15% price increase",
        "Monitor demand elasticity",
      ],
    });
  }

  // Recommendation 4: Partner network expansion
  if (forecast.some((f) => f.expectedOrderCount > 200)) {
    recommendations.push({
      geoZoneId,
      recommendationType: "INCREASE_PARTNERS",
      confidence: 0.9,
      expectedImpact: {
        revenueIncrease: 0,
        customerGrowth: 30,
        roi: 1.5,
      },
      actionItems: [
        "Recruit 5-10 new delivery partners",
        "Launch partner recruitment campaign",
        "Implement onboarding program",
      ],
    });
  }

  return recommendations;
}

/**
 * Get heatmap data (demand density by location)
 */
export async function getHeatmapData(
  geoZoneId: string,
  resolution: number = 500 // meters
): Promise<
  Array<{
    lat: number;
    lon: number;
    intensity: number; // 0-100
  }>
> {
  const zone = await prisma.geoZone.findUniqueOrThrow({
    where: { id: geoZoneId },
  });

  const deliveries = await prisma.delivery.findMany({
    where: {
      geoZoneId,
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
  });

  // Create grid cells
  const heatmapPoints = [];
  const cellSize = resolution / 111000; // Convert meters to degrees

  // Generate grid
  for (
    let lat = zone.centerLat - zone.radiusMeters / 111000;
    lat < zone.centerLat + zone.radiusMeters / 111000;
    lat += cellSize
  ) {
    for (
      let lon = zone.centerLon - zone.radiusMeters / 111000;
      lon < zone.centerLon + zone.radiusMeters / 111000;
      lon += cellSize
    ) {
      // Count deliveries in this cell
      let count = 0;
      for (const delivery of deliveries) {
        if (
          Math.abs(delivery.deliveryLat - lat) < cellSize &&
          Math.abs(delivery.deliveryLon - lon) < cellSize
        ) {
          count++;
        }
      }

      if (count > 0) {
        // Normalize to 0-100
        const intensity = Math.min(100, count * 10);
        heatmapPoints.push({
          lat: Math.round(lat * 10000) / 10000,
          lon: Math.round(lon * 10000) / 10000,
          intensity,
        });
      }
    }
  }

  return heatmapPoints;
}

/**
 * Calculate KPIs for a time period
 */
export async function calculateKPIs(
  geoZoneId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  fulfillmentRate: number;
  averageDeliveryTime: number;
  customerSatisfaction: number;
}> {
  const deliveries = await prisma.delivery.findMany({
    where: {
      geoZoneId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  let totalRevenue = 0;
  let totalDeliveryTime = 0;
  let completedDeliveries = 0;
  let ratings = [];

  for (const delivery of deliveries) {
    totalRevenue += delivery.totalPrice;

    if (delivery.actualDeliveryTime && delivery.estimatedDeliveryTime) {
      const deliveryTime =
        delivery.actualDeliveryTime.getTime() -
        delivery.createdAt.getTime();
      totalDeliveryTime += deliveryTime / (1000 * 60); // Convert to minutes
      completedDeliveries++;
    }
  }

  const metrics = await getDailyMetricsSummary(geoZoneId, startDate, endDate);

  return {
    totalRevenue,
    totalOrders: deliveries.length,
    averageOrderValue: metrics.averageOrderValue,
    fulfillmentRate: metrics.averageFulfillmentRate,
    averageDeliveryTime:
      completedDeliveries > 0 ? totalDeliveryTime / completedDeliveries : 0,
    customerSatisfaction: 4.2, // Placeholder - fetch from ratings
  };
}
