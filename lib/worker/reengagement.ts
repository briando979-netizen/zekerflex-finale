import { prisma } from "@/lib/prisma";

export async function identifyInactiveWorkers(daysSinceLastShift: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastShift);

  const inactiveWorkers = await prisma.shift.groupBy({
    by: ["assignedWorkerId"],
    where: {
      completedAt: { lt: cutoffDate },
    },
    orderBy: { _count: { id: "desc" } },
  });

  return inactiveWorkers.map((w) => w.assignedWorkerId).slice(0, 100);
}

export async function launchWinBackCampaign(
  workerIds: string[],
  bonusAmount: number = 30
) {
  const campaigns = [];

  for (const workerId of workerIds) {
    const worker = await prisma.freelancerProfile.findUnique({
      where: { id: workerId },
    });

    if (!worker) continue;

    const campaign = await prisma.reengagementCampaign.create({
      data: {
        workerId,
        campaignType: "WINBACK",
        bonusAmount,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.workerNotification.create({
      data: {
        workerId,
        title: "We miss you! €30 bonus waiting",
        body: `Come back and complete a shift within 2 weeks to earn €30 extra`,
        type: "REENGAGEMENT",
        actionUrl: `/worker/shifts`,
      },
    });

    campaigns.push(campaign);
  }

  return campaigns;
}

export async function offerSpecialPromotion(
  workerId: string,
  bonusPercentage: number = 20
) {
  const existingPromo = await prisma.specialPromotion.findFirst({
    where: { workerId, expiresAt: { gt: new Date() } },
  });

  if (existingPromo) return existingPromo;

  const promo = await prisma.specialPromotion.create({
    data: {
      workerId,
      bonusPercentage,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.workerNotification.create({
    data: {
      workerId,
      title: "Special offer: +20% on all shifts",
      body: `Earn 20% extra on every shift for the next 7 days. Limited time!`,
      type: "OFFER",
      actionUrl: `/worker/shifts?promo=true`,
    },
  });

  return promo;
}

export async function trackReengagementSuccess(
  campaignId: string,
  workerId: string
) {
  return prisma.reengagementCampaign.update({
    where: { id: campaignId },
    data: {
      engagedAt: new Date(),
      success: true,
    },
  });
}

export async function getReengagementMetrics(campaignType?: string) {
  const campaigns = await prisma.reengagementCampaign.findMany({
    where: campaignType ? { campaignType } : {},
    include: { worker: true },
  });

  const successfulCount = campaigns.filter((c) => c.success).length;
  const successRate = campaigns.length > 0 ? (successfulCount / campaigns.length) * 100 : 0;

  return {
    totalCampaigns: campaigns.length,
    successfulEngagements: successfulCount,
    successRate: Math.round(successRate),
    totalBonusSpent: campaigns.reduce((sum, c) => sum + (c.bonusAmount || 0), 0),
  };
}
