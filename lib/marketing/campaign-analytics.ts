import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// Bereken campagne metriek
export async function getCampaignMetrics(campaignId: string) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: { sends: true },
  });

  if (!campaign) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  const totalSends = campaign.sends.length;
  const opens = campaign.sends.filter((s) => s.opened).length;
  const clicks = campaign.sends.filter((s) => s.clicked).length;
  const bounces = campaign.sends.filter((s) => s.bounced).length;
  const conversions = campaign.sends.filter((s) => s.converted).length;

  const openRate = totalSends > 0 ? (opens / totalSends) * 100 : 0;
  const clickRate = totalSends > 0 ? (clicks / totalSends) * 100 : 0;
  const bounceRate = totalSends > 0 ? (bounces / totalSends) * 100 : 0;
  const conversionRate = totalSends > 0 ? (conversions / totalSends) * 100 : 0;

  return {
    campaignId,
    campaignName: campaign.name,
    totalSends,
    opens,
    clicks,
    bounces,
    conversions,
    openRate: parseFloat(openRate.toFixed(2)),
    clickRate: parseFloat(clickRate.toFixed(2)),
    bounceRate: parseFloat(bounceRate.toFixed(2)),
    conversionRate: parseFloat(conversionRate.toFixed(2)),
    status: campaign.status,
    createdAt: campaign.createdAt,
    sentAt: campaign.sentAt,
  };
}

// Haal alle campagne metriek op voor een tenant
export async function getTenantCampaignMetrics(tenantId: string) {
  const campaigns = await prisma.emailCampaign.findMany({
    where: { tenantId },
    include: { sends: true },
    orderBy: { createdAt: "desc" },
  });

  return campaigns.map((campaign) => {
    const totalSends = campaign.sends.length;
    const opens = campaign.sends.filter((s) => s.opened).length;
    const clicks = campaign.sends.filter((s) => s.clicked).length;
    const bounces = campaign.sends.filter((s) => s.bounced).length;
    const conversions = campaign.sends.filter((s) => s.converted).length;

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      totalSends,
      opens,
      clicks,
      bounces,
      conversions,
      openRate: totalSends > 0 ? parseFloat(((opens / totalSends) * 100).toFixed(2)) : 0,
      clickRate: totalSends > 0 ? parseFloat(((clicks / totalSends) * 100).toFixed(2)) : 0,
      bounceRate: totalSends > 0 ? parseFloat(((bounces / totalSends) * 100).toFixed(2)) : 0,
      conversionRate: totalSends > 0 ? parseFloat(((conversions / totalSends) * 100).toFixed(2)) : 0,
      status: campaign.status,
      createdAt: campaign.createdAt,
    };
  });
}

// Voeg tracking toe aan geopende email
export async function trackEmailOpen(
  campaignId: string,
  subscriberId: string,
  timestamp?: Date
) {
  const send = await prisma.emailSend.findFirst({
    where: {
      campaignId,
      subscriberId,
    },
  });

  if (!send) {
    return null;
  }

  await prisma.emailSend.update({
    where: { id: send.id },
    data: {
      opened: true,
      openedAt: timestamp ?? new Date(),
    },
  });

  // Update campagne statistieken
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { openCount: { increment: 1 } },
  });

  return send;
}

// Voeg tracking toe aan geklikte link
export async function trackEmailClick(
  campaignId: string,
  subscriberId: string,
  linkUrl: string,
  timestamp?: Date
) {
  const send = await prisma.emailSend.findFirst({
    where: {
      campaignId,
      subscriberId,
    },
  });

  if (!send) {
    return null;
  }

  await prisma.emailSend.update({
    where: { id: send.id },
    data: {
      clicked: true,
      clickedAt: timestamp ?? new Date(),
    },
  });

  // Update campagne statistieken
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { clickCount: { increment: 1 } },
  });

  // Voeg link analytics toe
  await prisma.emailClickEvent.create({
    data: {
      sendId: send.id,
      url: linkUrl,
      timestamp: timestamp ?? new Date(),
    },
  });

  return send;
}

// Voeg tracking toe aan bounce
export async function trackEmailBounce(
  campaignId: string,
  email: string,
  bounceType: "soft" | "hard" = "soft",
  bounceReason?: string
) {
  const send = await prisma.emailSend.findFirst({
    where: {
      campaignId,
      email,
    },
  });

  if (!send) {
    return null;
  }

  await prisma.emailSend.update({
    where: { id: send.id },
    data: {
      bounced: true,
      bouncedAt: new Date(),
      bounceReason: bounceReason,
    },
  });

  // Update abonnee status als hard bounce
  if (bounceType === "hard") {
    await prisma.emailSubscriber.update({
      where: { id: send.subscriberId },
      data: { status: "BOUNCED" },
    });
  }

  // Update campagne statistieken
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { bounceCount: { increment: 1 } },
  });

  return send;
}

// Voeg tracking toe aan conversie
export async function trackEmailConversion(
  campaignId: string,
  subscriberId: string,
  value?: number,
  timestamp?: Date
) {
  const send = await prisma.emailSend.findFirst({
    where: {
      campaignId,
      subscriberId,
    },
  });

  if (!send) {
    return null;
  }

  await prisma.emailSend.update({
    where: { id: send.id },
    data: {
      converted: true,
      convertedAt: timestamp ?? new Date(),
    },
  });

  // Update campagne statistieken
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { conversionCount: { increment: 1 } },
  });

  // Voeg conversie event toe
  if (value !== undefined) {
    await prisma.emailConversionEvent.create({
      data: {
        sendId: send.id,
        value,
        timestamp: timestamp ?? new Date(),
      },
    });
  }

  return send;
}

// Haal dagelijkse prestaties op
export async function getDailyPerformance(
  campaignId: string,
  days: number = 7
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const sends = await prisma.emailSend.findMany({
    where: {
      campaignId,
      createdAt: {
        gte: startDate,
      },
    },
  });

  // Groepeer per dag
  const dailyData: Record<string, any> = {};

  for (const send of sends) {
    const day = send.createdAt.toISOString().split("T")[0];

    if (!dailyData[day]) {
      dailyData[day] = {
        date: day,
        sends: 0,
        opens: 0,
        clicks: 0,
        bounces: 0,
        conversions: 0,
      };
    }

    dailyData[day].sends++;
    if (send.opened) dailyData[day].opens++;
    if (send.clicked) dailyData[day].clicks++;
    if (send.bounced) dailyData[day].bounces++;
    if (send.converted) dailyData[day].conversions++;
  }

  return Object.values(dailyData).sort(
    (a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

// Haal meest geklikt links op
export async function getTopLinks(
  campaignId: string,
  limit: number = 10
) {
  const clicks = await prisma.emailClickEvent.findMany({
    where: {
      send: { campaignId },
    },
    select: { url: true },
  });

  const linkCounts = clicks.reduce(
    (acc, click) => {
      acc[click.url] = (acc[click.url] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return Object.entries(linkCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([url, count]) => ({ url, clicks: count }));
}

// Haal abonnee engagement score op
export async function getSubscriberEngagementScore(
  subscriberId: string
): Promise<number> {
  const sends = await prisma.emailSend.findMany({
    where: { subscriberId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (sends.length === 0) return 0;

  let score = 0;

  for (const send of sends) {
    if (send.opened) score += 3;
    if (send.clicked) score += 5;
    if (send.converted) score += 10;
    if (send.bounced) score -= 5;
  }

  // Normaliseer naar 0-100
  return Math.max(0, Math.min(100, score));
}

// Haal engagement score details op
export async function getEngagementDetails(tenantId: string) {
  const subscribers = await prisma.emailSubscriber.findMany({
    where: { tenantId },
  });

  const details = await Promise.all(
    subscribers.map(async (sub) => ({
      subscriberId: sub.id,
      email: sub.email,
      engagementScore: await getSubscriberEngagementScore(sub.id),
      lastEngagementAt: sub.lastEngagementAt,
    }))
  );

  return details.sort((a, b) => b.engagementScore - a.engagementScore);
}

// Haal vervanging rate op (percentage abonnees dat minstens 1 email opende)
export async function getEngagementRate(campaignId: string): Promise<number> {
  const sends = await prisma.emailSend.findMany({
    where: { campaignId },
  });

  if (sends.length === 0) return 0;

  const engaged = sends.filter((s) => s.opened || s.clicked).length;
  return (engaged / sends.length) * 100;
}

// Haal kampagne vergelij op
export async function compareCampaigns(
  campaignIds: string[]
): Promise<any[]> {
  return Promise.all(
    campaignIds.map((id) => getCampaignMetrics(id))
  );
}

// Haal ROI op
export async function getCampaignROI(
  campaignId: string,
  cost: number
): Promise<number> {
  const conversions = await prisma.emailConversionEvent.findMany({
    where: {
      send: { campaignId },
    },
  });

  const revenue = conversions.reduce((sum, conv) => sum + (conv.value ?? 0), 0);
  return cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
}
