import { prisma } from "@/lib/prisma";

export async function calculateQualityScore(userId: string): Promise<number> {
  const [completionRate, averageRating, responseTime, lateRate] = await Promise.all([
    getCompletionRate(userId),
    getAverageRating(userId),
    getAverageResponseTime(userId),
    getLateRate(userId),
  ]);

  const score =
    completionRate * 0.3 +
    (averageRating / 5) * 0.35 +
    (1 - Math.min(responseTime / 3600, 1)) * 0.2 +
    (1 - lateRate) * 0.15;

  return Math.round(score * 100);
}

async function getCompletionRate(userId: string): Promise<number> {
  const [completed, total] = await Promise.all([
    prisma.shiftAssignment.count({
      where: { freelancerId: userId, status: "COMPLETED" },
    }),
    prisma.shiftAssignment.count({
      where: { freelancerId: userId },
    }),
  ]);

  return total > 0 ? completed / total : 0;
}

async function getAverageRating(userId: string): Promise<number> {
  const result = await prisma.shiftReview.aggregate({
    where: { shiftAssignment: { freelancerId: userId } },
    _avg: { rating: true },
  });

  return result._avg.rating || 0;
}

async function getAverageResponseTime(userId: string): Promise<number> {
  const assignments = await prisma.shiftAssignment.findMany({
    where: { freelancerId: userId },
    select: { createdAt: true, acceptedAt: true },
    take: 20,
  });

  const times = assignments
    .filter((a) => a.acceptedAt)
    .map((a) => new Date(a.acceptedAt!).getTime() - new Date(a.createdAt).getTime());

  return times.length > 0 ? times.reduce((a, b) => a + b) / times.length : 0;
}

async function getLateRate(userId: string): Promise<number> {
  const late = await prisma.shiftAssignment.count({
    where: {
      freelancerId: userId,
      status: "COMPLETED",
      lateCheckIn: true,
    },
  });

  const total = await prisma.shiftAssignment.count({
    where: { freelancerId: userId, status: "COMPLETED" },
  });

  return total > 0 ? late / total : 0;
}

export async function getQualityBenchmarks() {
  return {
    excellent: { min: 90, max: 100, tier: "TOP PERFORMER" },
    good: { min: 75, max: 89, tier: "RELIABLE" },
    average: { min: 60, max: 74, tier: "SATISFACTORY" },
    poor: { min: 0, max: 59, tier: "NEEDS IMPROVEMENT" },
  };
}
