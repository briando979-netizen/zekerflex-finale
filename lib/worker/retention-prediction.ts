import { prisma } from "@/lib/prisma";

export interface ChurnRiskFactors {
  daysSinceLastShift: number;
  declineInShiftsLast30d: number;
  avgRatingTrend: number;
  engagementScore: number;
  accountAgeDays: number;
  totalEarnings: number;
}

export async function predictChurnRisk(workerId: string): Promise<number> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: workerId },
    include: { user: true },
  });

  if (!profile) return 100;

  const now = new Date();
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last60d = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const shiftsLast30d = await prisma.shift.count({
    where: {
      assignedWorkerId: workerId,
      completedAt: { gte: last30d },
    },
  });

  const shiftsLast60d = await prisma.shift.count({
    where: {
      assignedWorkerId: workerId,
      completedAt: { gte: last60d, lt: last30d },
    },
  });

  const lastShift = await prisma.shift.findFirst({
    where: { assignedWorkerId: workerId },
    orderBy: { completedAt: "desc" },
  });

  const recentReviews = await prisma.freelancerReview.findMany({
    where: {
      freelancerId: workerId,
      createdAt: { gte: last30d },
    },
  });

  const daysSinceLastShift = lastShift
    ? Math.floor((now.getTime() - lastShift.completedAt!.getTime()) / (24 * 60 * 60 * 1000))
    : 365;

  const engagementScore = await prisma.workerEngagementScore.findUnique({
    where: { workerId },
  });

  const accountAge = Math.floor(
    (now.getTime() - profile.user.createdAt.getTime()) / (24 * 60 * 60 * 1000)
  );

  const ratingTrend =
    recentReviews.length > 0
      ? recentReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / recentReviews.length
      : 0;

  let churnRisk = 0;

  churnRisk += Math.min(daysSinceLastShift / 30, 1) * 30;
  churnRisk += Math.abs(shiftsLast30d - shiftsLast60d) > 0
    ? Math.min(Math.abs(shiftsLast30d - shiftsLast60d) / 10, 1) * 25
    : 0;
  churnRisk += (5 - ratingTrend) * 10;
  churnRisk += Math.max(0, (100 - (engagementScore?.score || 50)) / 100) * 20;
  churnRisk += accountAge < 90 ? 15 : 0;

  await prisma.churnPrediction.upsert({
    where: { workerId },
    update: {
      riskScore: Math.round(churnRisk),
      daysSinceLastShift,
      updatedAt: new Date(),
    },
    create: {
      workerId,
      riskScore: Math.round(churnRisk),
      daysSinceLastShift,
    },
  });

  return Math.round(churnRisk);
}

export async function getHighChurnRiskWorkers(threshold: number = 70) {
  return prisma.churnPrediction.findMany({
    where: { riskScore: { gte: threshold } },
    orderBy: { riskScore: "desc" },
    include: { worker: true },
  });
}
