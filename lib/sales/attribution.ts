import { type AttributionModel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

/**
 * Attribution — Channel source, multi-touch attribution
 * Subsystem 6 of 6 in the Sales Funnel Engine
 */

export interface AttributionMetrics {
  channel: string;
  firstTouches: number;
  lastTouches: number;
  conversions: number;
  conversionValue: number;
  roas: number; // return on ad spend
}

export interface ChannelMix {
  channel: string;
  percentage: number;
  touches: number;
  value: number;
}

/**
 * Calculate multi-touch attribution for a conversion.
 */
export async function calculateAttribution(
  leadCaptureId: string,
  model: AttributionModel = "LAST_TOUCH",
  conversionValue?: number,
): Promise<{
  attribution: any;
  weights: Record<string, number>;
}> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
    include: {
      interactions: {
        orderBy: { createdAt: "asc" },
      },
      sequences: {
        orderBy: { createdAt: "asc" },
      },
      attribution: true,
    },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  // Get all touchpoints
  const touchpoints = [
    ...(lead.attribution
      ? [
          {
            channel: lead.attribution.firstTouchChannel,
            timestamp: lead.attribution.firstTouchDate,
            type: "first_touch",
          },
        ]
      : []),
    ...lead.sequences.map((s) => ({
      channel: "email",
      timestamp: s.sentAt || s.createdAt,
      type: "email",
    })),
    ...lead.interactions.map((i) => ({
      channel: i.type === "page_view" ? "organic" : "direct",
      timestamp: i.createdAt,
      type: i.type,
    })),
  ];

  // Remove duplicates and sort
  const uniqueTouchpoints = Array.from(
    new Map(
      touchpoints.map((t) => [
        `${t.channel}-${t.timestamp.getTime()}`,
        t,
      ]),
    ).values(),
  ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Calculate weights based on attribution model
  let weights: Record<string, number> = {};

  switch (model) {
    case "FIRST_TOUCH":
      weights[uniqueTouchpoints[0]?.channel ?? "direct"] = 100;
      break;

    case "LAST_TOUCH":
      weights[
        uniqueTouchpoints[uniqueTouchpoints.length - 1]?.channel ?? "direct"
      ] = 100;
      break;

    case "LINEAR":
      uniqueTouchpoints.forEach((_, i) => {
        const channel =
          uniqueTouchpoints[i]?.channel ?? "direct";
        weights[channel] = (weights[channel] ?? 0) + 100 / uniqueTouchpoints.length;
      });
      break;

    case "TIME_DECAY":
      // More recent touchpoints get more credit
      uniqueTouchpoints.forEach((tp, i) => {
        const channel = tp.channel;
        const weight = Math.pow(2, i - uniqueTouchpoints.length + 1);
        weights[channel] = (weights[channel] ?? 0) + weight;
      });
      // Normalize to 100
      const total = Object.values(weights).reduce((a, b) => a + b, 1);
      Object.keys(weights).forEach((k) => {
        weights[k] = (weights[k] / total) * 100;
      });
      break;

    case "U_SHAPED":
      // First and last touch get 40% each, middle 20%
      if (uniqueTouchpoints.length === 1) {
        weights[uniqueTouchpoints[0]?.channel ?? "direct"] = 100;
      } else if (uniqueTouchpoints.length === 2) {
        const first = uniqueTouchpoints[0]?.channel ?? "direct";
        const last = uniqueTouchpoints[1]?.channel ?? "direct";
        weights[first] = (weights[first] ?? 0) + 50;
        weights[last] = (weights[last] ?? 0) + 50;
      } else {
        const first = uniqueTouchpoints[0]?.channel ?? "direct";
        const last =
          uniqueTouchpoints[uniqueTouchpoints.length - 1]?.channel ??
          "direct";
        weights[first] = (weights[first] ?? 0) + 40;
        weights[last] = (weights[last] ?? 0) + 40;

        // Distribute 20% among middle touchpoints
        const middleWeight = 20 / (uniqueTouchpoints.length - 2);
        for (let i = 1; i < uniqueTouchpoints.length - 1; i++) {
          const channel = uniqueTouchpoints[i]?.channel ?? "direct";
          weights[channel] = (weights[channel] ?? 0) + middleWeight;
        }
      }
      break;
  }

  // Update attribution record
  const attribution = await prisma.leadAttribution.findUnique({
    where: { leadCaptureId },
  });

  if (attribution) {
    const channels = Object.keys(weights);
    await prisma.leadAttribution.update({
      where: { id: attribution.id },
      data: {
        attributionModel: model,
        channelWeights: weights as any,
        touchpointChannels: channels,
        touchpointCount: uniqueTouchpoints.length,
        conversionValue: conversionValue ?? null,
        convertedAt: conversionValue ? new Date() : null,
      },
    });
  }

  return {
    attribution: {
      model,
      touchpoints: uniqueTouchpoints,
      conversionValue,
    },
    weights,
  };
}

/**
 * Get attribution metrics by channel.
 */
export async function getAttributionByChannel(): Promise<AttributionMetrics[]> {
  const attributions = await prisma.leadAttribution.findMany({
    include: { leadCapture: true },
  });

  const channelMap = new Map<string, AttributionMetrics>();

  for (const attr of attributions) {
    const channel = attr.firstTouchChannel;

    if (!channelMap.has(channel)) {
      channelMap.set(channel, {
        channel,
        firstTouches: 0,
        lastTouches: 0,
        conversions: 0,
        conversionValue: 0,
        roas: 0,
      });
    }

    const metrics = channelMap.get(channel)!;
    metrics.firstTouches++;

    if (attr.lastTouchChannel === channel) {
      metrics.lastTouches++;
    }

    if (attr.convertedAt) {
      metrics.conversions++;
      metrics.conversionValue += attr.conversionValue ?? 0;
    }
  }

  return Array.from(channelMap.values()).sort(
    (a, b) => b.conversions - a.conversions,
  );
}

/**
 * Get channel mix for converted leads.
 */
export async function getChannelMix(): Promise<ChannelMix[]> {
  const attributions = await prisma.leadAttribution.findMany({
    where: {
      convertedAt: { not: null },
    },
    include: { leadCapture: true },
  });

  const channelMap = new Map<string, { touches: number; value: number }>();

  for (const attr of attributions) {
    const channels = attr.touchpointChannels;
    const weights = (attr.channelWeights as Record<string, number>) ?? {};

    for (const channel of channels) {
      if (!channelMap.has(channel)) {
        channelMap.set(channel, { touches: 0, value: 0 });
      }

      const data = channelMap.get(channel)!;
      data.touches += 1;
      data.value +=
        ((weights[channel] ?? 0) / 100) * (attr.conversionValue ?? 0);
    }
  }

  const total = Array.from(channelMap.values()).reduce(
    (sum, v) => sum + v.touches,
    0,
  );

  return Array.from(channelMap.entries())
    .map(([channel, data]) => ({
      channel,
      percentage: total > 0 ? (data.touches / total) * 100 : 0,
      touches: data.touches,
      value: Math.round(data.value),
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

/**
 * Get ROI by attribution model.
 */
export async function getRoiByModel(): Promise<
  Record<string, { conversions: number; value: number; roi: number }>
> {
  const models: AttributionModel[] = [
    "FIRST_TOUCH",
    "LAST_TOUCH",
    "LINEAR",
    "TIME_DECAY",
    "U_SHAPED",
  ];
  const results: Record<string, { conversions: number; value: number; roi: number }> = {};

  for (const model of models) {
    const attributions = await prisma.leadAttribution.findMany({
      where: {
        attributionModel: model,
        convertedAt: { not: null },
      },
    });

    const conversions = attributions.length;
    const value = attributions.reduce(
      (sum, a) => sum + (a.conversionValue ?? 0),
      0,
    );

    results[model] = {
      conversions,
      value,
      roi:
        conversions > 0
          ? Math.round((value / (conversions * 500)) * 100) // Assuming $500 cost per lead
          : 0,
    };
  }

  return results;
}

/**
 * Track UTM parameters and create attribution record.
 */
export async function trackUtmAttribution(
  leadCaptureId: string,
  source: string,
  medium: string,
  campaign: string,
  content?: string,
): Promise<void> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  // Update lead with UTM
  await prisma.leadCapture.update({
    where: { id: leadCaptureId },
    data: {
      utmSource: source,
      utmMedium: medium,
      utmCampaign: campaign,
    },
  });

  // Update or create attribution
  const existing = await prisma.leadAttribution.findUnique({
    where: { leadCaptureId },
  });

  if (existing) {
    await prisma.leadAttribution.update({
      where: { id: existing.id },
      data: {
        firstTouchSource: campaign,
        touchpointChannels: Array.from(
          new Set([...existing.touchpointChannels, `${source}-${medium}`]),
        ),
      },
    });
  } else {
    await prisma.leadAttribution.create({
      data: {
        leadCaptureId,
        firstTouchChannel: medium,
        firstTouchDate: new Date(),
        firstTouchSource: campaign,
      },
    });
  }

  await recordAudit({
    category: "SALES",
    action: "utm.tracked",
    summary: `UTM attribuut vastgelegd voor ${lead.email} (campagne: ${campaign})`,
    targetType: "leadCapture",
    targetId: leadCaptureId,
  });

  logger.info("UTM attribution tracked", {
    leadId: leadCaptureId,
    source,
    medium,
    campaign,
  });
}

/**
 * Get attribution report for a date range.
 */
export async function getAttributionReport(
  startDate: Date,
  endDate: Date,
) {
  const attributions = await prisma.leadAttribution.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: { leadCapture: true },
  });

  const channels = await getAttributionByChannel();
  const channelMix = await getChannelMix();
  const roiByModel = await getRoiByModel();

  // Calculate summary metrics
  const totalLeads = attributions.length;
  const convertedLeads = attributions.filter(
    (a) => a.convertedAt,
  ).length;
  const totalValue = attributions.reduce(
    (sum, a) => sum + (a.conversionValue ?? 0),
    0,
  );
  const conversionRate =
    totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
  const avgValue = convertedLeads > 0 ? Math.round(totalValue / convertedLeads) : 0;

  return {
    period: {
      startDate,
      endDate,
    },
    summary: {
      totalLeads,
      convertedLeads,
      conversionRate: Math.round(conversionRate * 100) / 100,
      totalValue,
      avgValue,
    },
    byChannel: channels,
    channelMix,
    roiByModel,
    recommendations: generateAttributionRecommendations(
      channels,
      roiByModel,
    ),
  };
}

/**
 * Generate recommendations based on attribution data.
 */
function generateAttributionRecommendations(
  channels: AttributionMetrics[],
  roiByModel: Record<string, { conversions: number; value: number; roi: number }>,
): string[] {
  const recommendations: string[] = [];

  // Find best performing channel
  const bestChannel = channels.reduce((best, current) =>
    (current.conversions ?? 0) > (best?.conversions ?? 0) ? current : best,
  );

  if (bestChannel) {
    recommendations.push(
      `"${bestChannel.channel}" is het beste kanaal met ${bestChannel.conversions} conversies. Verhoog de investering hier.`,
    );
  }

  // Find underperforming channels
  channels.forEach((channel) => {
    if ((channel.conversions ?? 0) === 0) {
      recommendations.push(
        `"${channel.channel}" genereert geen conversies. Heroverweeg investering of optimaliseer de campagne.`,
      );
    }
  });

  // Attribution model advice
  const bestModel = Object.entries(roiByModel).reduce((best, [key, data]) =>
    data.roi > (best?.[1]?.roi ?? 0) ? [key, data] : best,
  );

  if (bestModel) {
    recommendations.push(
      `Gebruik attributie model "${bestModel[0]}" voor betere ROI-berekening.`,
    );
  }

  return recommendations;
}
