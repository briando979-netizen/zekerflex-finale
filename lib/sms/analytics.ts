import { prisma } from "@/lib/prisma";

export interface SMSMetrics {
  totalSent: number;
  delivered: number;
  failed: number;
  deliveryRate: number;
  opened: number;
  clicked: number;
  converted: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  costPerMessage: number;
  costPerConversion: number;
}

export async function getSMSMetrics(campaignId: string, tenantId: string): Promise<SMSMetrics> {
  const campaign = await prisma.smsCampaign.findUnique({
    where: { id: campaignId, tenantId },
    include: { metrics: true },
  });

  if (!campaign?.metrics) {
    return {
      totalSent: 0,
      delivered: 0,
      failed: 0,
      deliveryRate: 0,
      opened: 0,
      clicked: 0,
      converted: 0,
      openRate: 0,
      clickRate: 0,
      conversionRate: 0,
      costPerMessage: 0,
      costPerConversion: 0,
    };
  }

  const metrics = campaign.metrics;
  const totalSent = metrics.delivered + metrics.failed;
  const deliveryRate = totalSent > 0 ? metrics.delivered / totalSent : 0;
  const openRate = metrics.delivered > 0 ? metrics.opened / metrics.delivered : 0;
  const clickRate = metrics.delivered > 0 ? metrics.clicked / metrics.delivered : 0;
  const conversionRate = metrics.delivered > 0 ? metrics.converted / metrics.delivered : 0;

  return {
    totalSent,
    delivered: metrics.delivered,
    failed: metrics.failed,
    deliveryRate,
    opened: metrics.opened,
    clicked: metrics.clicked,
    converted: metrics.converted,
    openRate,
    clickRate,
    conversionRate,
    costPerMessage: metrics.totalCost / (totalSent || 1),
    costPerConversion: metrics.converted > 0 ? metrics.totalCost / metrics.converted : 0,
  };
}

export async function trackEvent(
  campaignId: string,
  userId: string,
  event: "DELIVERED" | "FAILED" | "OPENED" | "CLICKED" | "CONVERTED",
  tenantId: string
) {
  await prisma.smsCampaignEvent.create({
    data: {
      campaignId,
      userId,
      event,
      tenantId,
      occurredAt: new Date(),
    },
  });

  const delta: Record<string, number> = {};
  delta[event.toLowerCase()] = 1;
  await updateCampaignMetrics(campaignId, delta);
}

async function updateCampaignMetrics(campaignId: string, delta: Record<string, number>) {
  await prisma.smsCampaignMetrics.update({
    where: { campaignId },
    data: {
      delivered: delta.delivered ? { increment: delta.delivered } : undefined,
      failed: delta.failed ? { increment: delta.failed } : undefined,
      opened: delta.opened ? { increment: delta.opened } : undefined,
      clicked: delta.clicked ? { increment: delta.clicked } : undefined,
      converted: delta.converted ? { increment: delta.converted } : undefined,
    },
  });
}

export async function getPerformanceBySegment(campaignId: string, tenantId: string) {
  const events = await prisma.smsCampaignEvent.findMany({
    where: { campaignId, tenantId },
    include: { user: { include: { segments: true } } },
  });

  const segmentMetrics: Record<string, SMSMetrics> = {};

  for (const event of events) {
    for (const segment of event.user?.segments ?? []) {
      if (!segmentMetrics[segment.id]) {
        segmentMetrics[segment.id] = {
          totalSent: 0,
          delivered: 0,
          failed: 0,
          deliveryRate: 0,
          opened: 0,
          clicked: 0,
          converted: 0,
          openRate: 0,
          clickRate: 0,
          conversionRate: 0,
          costPerMessage: 0,
          costPerConversion: 0,
        };
      }

      if (event.event === "DELIVERED") segmentMetrics[segment.id].delivered++;
      if (event.event === "FAILED") segmentMetrics[segment.id].failed++;
      if (event.event === "OPENED") segmentMetrics[segment.id].opened++;
      if (event.event === "CLICKED") segmentMetrics[segment.id].clicked++;
      if (event.event === "CONVERTED") segmentMetrics[segment.id].converted++;
    }
  }

  return segmentMetrics;
}

export async function getTopPerformingMessages(tenantId: string, limit = 10) {
  const campaigns = await prisma.smsCampaign.findMany({
    where: { tenantId },
    include: { metrics: true },
    orderBy: { "metrics.converted": "desc" },
    take: limit,
  });

  return campaigns.map((c) => ({
    id: c.id,
    message: c.message,
    converted: c.metrics?.converted ?? 0,
    conversionRate: c.metrics ? (c.metrics.converted / (c.metrics.delivered || 1)) * 100 : 0,
  }));
}

export async function getMostClickedMessages(tenantId: string, limit = 10) {
  const campaigns = await prisma.smsCampaign.findMany({
    where: { tenantId },
    include: { metrics: true },
    orderBy: { "metrics.clicked": "desc" },
    take: limit,
  });

  return campaigns.map((c) => ({
    id: c.id,
    message: c.message,
    clicked: c.metrics?.clicked ?? 0,
    clickRate: c.metrics ? (c.metrics.clicked / (c.metrics.delivered || 1)) * 100 : 0,
  }));
}
