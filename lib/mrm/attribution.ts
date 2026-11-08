import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

// ============================================================================
// 6. ATTRIBUTION & ANALYTICS - Multi-touch attribution, channel mix, forecasting
// ============================================================================

const CreateAttributionSchema = z.object({
  campaignId: z.string().optional(),
  conversionId: z.string(),
  touchpoints: z.array(z.string()), // Campaign IDs that contributed
  attributionModel: z.enum([
    "FIRST_TOUCH",
    "LAST_TOUCH",
    "LINEAR",
    "TIME_DECAY",
    "U_SHAPED",
    "W_SHAPED",
    "CUSTOM",
  ]),
  channelWeights: z.record(z.number()).optional(),
  totalValue: z.number().positive(),
  conversionDate: z.string().datetime(),
  attributionWindow: z.enum(["7_DAYS", "30_DAYS", "90_DAYS", "12_MONTHS"]).optional(),
});

export type CreateAttributionInput = z.infer<typeof CreateAttributionSchema>;

/**
 * Calculate attribution weights based on model
 */
function calculateAttributionWeights(
  model: string,
  touchpoints: number,
  customWeights?: Record<string, number>,
): number[] {
  const weights: number[] = [];

  switch (model) {
    case "FIRST_TOUCH":
      weights[0] = 1;
      for (let i = 1; i < touchpoints; i++) weights[i] = 0;
      break;

    case "LAST_TOUCH":
      for (let i = 0; i < touchpoints - 1; i++) weights[i] = 0;
      weights[touchpoints - 1] = 1;
      break;

    case "LINEAR":
      const linearWeight = 1 / touchpoints;
      for (let i = 0; i < touchpoints; i++) weights[i] = linearWeight;
      break;

    case "TIME_DECAY":
      // More recent touches get more weight
      let sum = 0;
      for (let i = 1; i <= touchpoints; i++) {
        weights[i - 1] = i;
        sum += i;
      }
      for (let i = 0; i < touchpoints; i++) weights[i] = weights[i] / sum;
      break;

    case "U_SHAPED":
      // First and last get 40% each, middle gets 20%
      if (touchpoints === 1) {
        weights[0] = 1;
      } else if (touchpoints === 2) {
        weights[0] = 0.5;
        weights[1] = 0.5;
      } else {
        weights[0] = 0.4;
        for (let i = 1; i < touchpoints - 1; i++) {
          weights[i] = 0.2 / (touchpoints - 2);
        }
        weights[touchpoints - 1] = 0.4;
      }
      break;

    case "W_SHAPED":
      // First, middle, and last get 30% each, rest split 10%
      if (touchpoints === 1) {
        weights[0] = 1;
      } else if (touchpoints === 2) {
        weights[0] = 0.5;
        weights[1] = 0.5;
      } else {
        weights[0] = 0.3;
        const middleIndex = Math.floor(touchpoints / 2);
        weights[middleIndex] = 0.3;
        weights[touchpoints - 1] = 0.3;

        const remaining = 0.1 / (touchpoints - 3);
        for (let i = 1; i < touchpoints; i++) {
          if (i !== middleIndex && i !== touchpoints - 1) {
            weights[i] = remaining;
          }
        }
      }
      break;

    case "CUSTOM":
      if (!customWeights || Object.keys(customWeights).length === 0) {
        throw AppError.validation("Aangepaste gewichten vereist voor CUSTOM model");
      }
      for (let i = 0; i < touchpoints; i++) {
        weights[i] = Object.values(customWeights)[i] || 1 / touchpoints;
      }
      break;

    default:
      throw AppError.validation(`Onbekend attributiemodel: ${model}`);
  }

  return weights;
}

/**
 * Track a conversion with attribution
 */
export async function trackAttribution(input: CreateAttributionInput) {
  const validated = CreateAttributionSchema.parse(input);

  if (validated.touchpoints.length === 0) {
    throw AppError.validation("Ten minste één aanraakpunt vereist");
  }

  const weights = calculateAttributionWeights(
    validated.attributionModel,
    validated.touchpoints.length,
    validated.channelWeights,
  );

  const attributedValue = Math.round((validated.totalValue * weights[0]) * 100); // Use first weight for primary campaign

  return prisma.mrmAttribution.create({
    data: {
      campaignId: validated.campaignId || null,
      conversionId: validated.conversionId,
      touchpoints: validated.touchpoints,
      attributionModel: validated.attributionModel,
      channelWeights: validated.channelWeights || {},
      totalValue: Math.round(validated.totalValue * 100), // Store as cents
      attributedValue,
      conversionDate: new Date(validated.conversionDate),
      attributionWindow: validated.attributionWindow || "30_DAYS",
    },
  });
}

/**
 * Get attribution data for a campaign
 */
export async function getAttributionByCampaign(campaignId: string) {
  const attributions = await prisma.mrmAttribution.findMany({
    where: {
      OR: [
        { campaignId },
        { touchpoints: { has: campaignId } },
      ],
    },
    orderBy: { conversionDate: "desc" },
  });

  return attributions.map((attr) => ({
    ...attr,
    totalValue: attr.totalValue / 100,
    attributedValue: attr.attributedValue / 100,
  }));
}

/**
 * Get channel mix analysis
 */
export async function getChannelMixAnalysis(tenantId: string, period: string) {
  // Find all campaigns that were active in this period
  const campaigns = await prisma.mrmCampaign.findMany({
    where: {
      tenantId,
      scheduledStart: {
        lte: new Date(`${period}-31`),
      },
    },
  });

  const channelMetrics: Record<string, any> = {};

  // Aggregate metrics by channel
  for (const campaign of campaigns) {
    for (const channel of campaign.channels) {
      if (!channelMetrics[channel]) {
        channelMetrics[channel] = {
          channel,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          spend: 0,
          revenue: 0,
        };
      }

      channelMetrics[channel].impressions += campaign.impressions;
      channelMetrics[channel].clicks += campaign.clicks;
      channelMetrics[channel].conversions += campaign.conversions;
      channelMetrics[channel].spend += campaign.spend;
    }
  }

  // Calculate metrics for each channel
  return Object.values(channelMetrics).map((metrics: any) => ({
    ...metrics,
    ctr: metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0,
    conversionRate: metrics.clicks > 0 ? (metrics.conversions / metrics.clicks) * 100 : 0,
    cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0,
    roas: metrics.spend > 0 ? (metrics.revenue || 0) / metrics.spend : 0,
  }));
}

/**
 * Get ROI analysis
 */
export async function getRoiAnalysis(campaignId: string) {
  const [campaign, budgetLines, attributions] = await Promise.all([
    prisma.mrmCampaign.findUnique({
      where: { id: campaignId },
    }),
    prisma.mrmBudgetLine.findMany({
      where: { campaignId },
    }),
    prisma.mrmAttribution.findMany({
      where: { campaignId },
    }),
  ]);

  if (!campaign) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  const totalSpend = budgetLines.reduce((sum, line) => sum + line.spentBudget, 0);
  const totalRevenue = attributions.reduce((sum, attr) => sum + attr.attributedValue, 0);
  const roi = totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0;

  return {
    campaignId,
    campaignName: campaign.name,
    totalSpend: totalSpend / 100,
    totalRevenue: totalRevenue / 100,
    roi,
    roi_Status:
      roi > 50 ? "EXCELLENT" : roi > 25 ? "GOOD" : roi > 0 ? "POSITIVE" : "NEGATIVE",
    conversions: campaign.conversions,
    costPerConversion: campaign.conversions > 0 ? totalSpend / 100 / campaign.conversions : 0,
  };
}

/**
 * Get multi-touch attribution analysis
 */
export async function getMultiTouchAnalysis(campaignId: string) {
  const attributions = await prisma.mrmAttribution.findMany({
    where: {
      touchpoints: { has: campaignId },
    },
  });

  if (attributions.length === 0) {
    return {
      campaignId,
      totalConversionsInfluenced: 0,
      totalInfluencedRevenue: 0,
      averageAttributionValue: 0,
      mostCommonPositionInPath: "N/A",
    };
  }

  let totalAttributed = 0;
  let positionCounts: Record<string, number> = {
    first: 0,
    middle: 0,
    last: 0,
  };

  for (const attr of attributions) {
    totalAttributed += attr.attributedValue;

    const position = attr.touchpoints.indexOf(campaignId);
    if (position === 0) positionCounts.first++;
    else if (position === attr.touchpoints.length - 1) positionCounts.last++;
    else positionCounts.middle++;
  }

  const mostCommon =
    positionCounts.first >= positionCounts.middle && positionCounts.first >= positionCounts.last
      ? "FIRST"
      : positionCounts.last >= positionCounts.middle
        ? "LAST"
        : "MIDDLE";

  return {
    campaignId,
    totalConversionsInfluenced: attributions.length,
    totalInfluencedRevenue: totalAttributed / 100,
    averageAttributionValue: totalAttributed / 100 / attributions.length,
    mostCommonPositionInPath: mostCommon,
    positionDistribution: {
      first: positionCounts.first,
      middle: positionCounts.middle,
      last: positionCounts.last,
    },
  };
}

/**
 * Forecast revenue based on historical data
 */
export async function forecastRevenue(
  tenantId: string,
  daysAhead: number,
  historicalDays: number = 30,
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - historicalDays);

  const historicalAttributions = await prisma.mrmAttribution.findMany({
    where: {
      tenantId,
      conversionDate: { gte: cutoffDate },
    },
  });

  if (historicalAttributions.length === 0) {
    return {
      forecastedRevenue: 0,
      confidence: 0,
      message: "Niet genoeg historische gegevens voor prognose",
    };
  }

  const dailyRevenue: Record<string, number> = {};
  historicalAttributions.forEach((attr) => {
    const day = attr.conversionDate.toISOString().split("T")[0];
    dailyRevenue[day] = (dailyRevenue[day] || 0) + (attr.attributedValue / 100);
  });

  const dailyValues = Object.values(dailyRevenue);
  const averageDailyRevenue = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;

  // Simple forecast: multiply average daily by days ahead
  const forecastedRevenue = averageDailyRevenue * daysAhead;

  // Calculate confidence based on variance
  const variance =
    dailyValues.reduce((sum, val) => sum + Math.pow(val - averageDailyRevenue, 2), 0) /
    dailyValues.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation =
    averageDailyRevenue > 0 ? (stdDev / averageDailyRevenue) * 100 : 100;

  // Lower CV = higher confidence
  const confidence = Math.max(0, Math.min(100, 100 - coefficientOfVariation * 2));

  return {
    forecastedRevenue: Math.round(forecastedRevenue * 100) / 100,
    confidence: Math.round(confidence),
    daysAhead,
    averageDailyRevenue: Math.round(averageDailyRevenue * 100) / 100,
  };
}

/**
 * Create attribution analysis report
 */
export async function createAttributionAnalysis(
  tenantId: string,
  period: string, // YYYY-MM
  analysisType: "CHANNEL_MIX" | "FORECASTING" | "OPTIMIZATION",
) {
  let analysis: any = {};

  if (analysisType === "CHANNEL_MIX") {
    analysis.channelData = await getChannelMixAnalysis(tenantId, period);
  } else if (analysisType === "FORECASTING") {
    analysis.forecast = await forecastRevenue(tenantId, 30, 60);
  } else if (analysisType === "OPTIMIZATION") {
    // Get underperforming channels for optimization recommendations
    const channels = await getChannelMixAnalysis(tenantId, period);
    analysis.recommendations = channels
      .filter((ch: any) => ch.roas < 2)
      .map((ch: any) => ({
        channel: ch.channel,
        suggestion: "Optimize targeting or reduce spend",
        estimatedPotential: ch.revenue * 0.2,
      }));
  }

  return prisma.mrmAttributionAnalysis.create({
    data: {
      tenantId,
      period,
      analysisType,
      channelData: analysis.channelData || {},
      forecast: analysis.forecast || null,
      recommendations: analysis.recommendations || null,
    },
  });
}
