import { prisma } from "@/lib/prisma";

interface EngagementMetrics {
  shiftsTakenLast30d: number;
  acceptanceRate: number;
  avgEarningsPerShift: number;
  profileCompletion: number;
  reviewsCount: number;
  avgRating: number;
}

export async function calculateEngagementScore(
  workerId: string
): Promise<number> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: workerId },
  });

  if (!profile) return 0;

  const last30d = new Date();
  last30d.setDate(last30d.getDate() - 30);

  const shifts = await prisma.shift.findMany({
    where: {
      assignedWorkerId: workerId,
      completedAt: { gte: last30d },
    },
  });

  const totalAssignments = await prisma.shiftAssignment.count({
    where: { workerId, createdAt: { gte: last30d } },
  });

  const reviews = await prisma.freelancerReview.findMany({
    where: { freelancerId: workerId },
  });

  const metrics: EngagementMetrics = {
    shiftsTakenLast30d: shifts.length,
    acceptanceRate:
      totalAssignments > 0 ? shifts.length / totalAssignments : 0,
    avgEarningsPerShift:
      shifts.length > 0
        ? shifts.reduce((sum, s) => sum + (s.wagePerHour || 0), 0) /
          shifts.length
        : 0,
    profileCompletion:
      (profile.verified ? 20 : 0) +
      (profile.bio ? 20 : 0) +
      (profile.skills && profile.skills.length > 0 ? 30 : 0) +
      (profile.profileImageUrl ? 15 : 0) +
      (profile.phoneVerified ? 15 : 0),
    reviewsCount: reviews.length,
    avgRating:
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
        : 0,
  };

  const score =
    Math.min(metrics.shiftsTakenLast30d / 10, 1) * 20 +
    metrics.acceptanceRate * 20 +
    Math.min(metrics.avgEarningsPerShift / 100, 1) * 15 +
    Math.min(metrics.profileCompletion / 100, 1) * 20 +
    Math.min(metrics.reviewsCount / 20, 1) * 15 +
    Math.min(metrics.avgRating / 5, 1) * 10;

  await prisma.workerEngagementScore.upsert({
    where: { workerId },
    update: { score: Math.round(score), updatedAt: new Date() },
    create: {
      workerId,
      score: Math.round(score),
    },
  });

  return Math.round(score);
}

export async function getTopEngagedWorkers(limit: number = 50) {
  return prisma.workerEngagementScore.findMany({
    orderBy: { score: "desc" },
    take: limit,
    include: { worker: true },
  });
}
