import { prisma } from "@/lib/prisma";

export interface PersonalizedOffer {
  workerId: string;
  title: string;
  description: string;
  incentiveAmount: number;
  conditions: string;
  expiresAt: Date;
}

export async function sendPersonalizedMessage(
  workerId: string,
  title: string,
  body: string,
  actionUrl?: string
) {
  const worker = await prisma.freelancerProfile.findUnique({
    where: { id: workerId },
    include: { user: true },
  });

  if (!worker) throw new Error("Worker not found");

  return prisma.workerNotification.create({
    data: {
      workerId,
      title,
      body,
      actionUrl,
      type: "ENGAGEMENT",
    },
  });
}

export async function sendPersonalizedOffers(workerId: string) {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: workerId },
  });

  if (!profile) return;

  const engagementScore = await prisma.workerEngagementScore.findUnique({
    where: { workerId },
  });

  const offers: PersonalizedOffer[] = [];

  if (!engagementScore || engagementScore.score < 50) {
    offers.push({
      workerId,
      title: "Come back & earn €25 bonus",
      description: "Complete your next shift and get €25 extra",
      incentiveAmount: 25,
      conditions: "Complete 1 shift within 7 days",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  if (engagementScore && engagementScore.score > 75) {
    offers.push({
      workerId,
      title: "VIP Early Access",
      description: "Access premium shifts before others",
      incentiveAmount: 0,
      conditions: "Instant access to exclusive shifts",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  for (const offer of offers) {
    await sendPersonalizedMessage(
      workerId,
      offer.title,
      offer.description,
      `/worker/offers/${workerId}`
    );

    await prisma.personalisedOffer.create({
      data: {
        workerId: offer.workerId,
        title: offer.title,
        description: offer.description,
        incentiveAmount: offer.incentiveAmount,
        conditions: offer.conditions,
        expiresAt: offer.expiresAt,
      },
    });
  }

  return offers;
}

export async function getActiveOffersForWorker(workerId: string) {
  return prisma.personalisedOffer.findMany({
    where: {
      workerId,
      expiresAt: { gt: new Date() },
      claimedAt: null,
    },
  });
}
