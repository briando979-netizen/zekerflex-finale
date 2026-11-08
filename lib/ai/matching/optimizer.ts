import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/ops/logger";

interface MatchScore {
  userId: string;
  targetId: string;
  score: number;
  factors: Record<string, number>;
  successProbability: number;
  churnRisk: number;
}

export async function computeMatchScore(userId: string, targetId: string): Promise<MatchScore> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const target = await prisma.user.findUnique({ where: { id: targetId } });

    if (!user || !target) throw new Error("User not found");

    // Preference alignment
    const prefScore = await computePreferenceAlignment(user, target);

    // Success history
    const successScore = await computeSuccessHistory(userId, targetId);

    // Churn indicators
    const churnRisk = await computeChurnRisk(userId, targetId);

    // Fairness checks
    const fairnessScore = await computeFairnessScore(userId, targetId);

    const factors = {
      preference: prefScore,
      success: successScore,
      fairness: fairnessScore,
    };

    const score = (prefScore * 0.4 + successScore * 0.35 + fairnessScore * 0.25);
    const successProb = Math.max(0, Math.min(1, score));

    return {
      userId,
      targetId,
      score,
      factors,
      successProbability: successProb,
      churnRisk: Math.max(0, 1 - churnRisk),
    };
  } catch (err) {
    logger.error("Match score computation failed", { userId, targetId, err });
    throw err;
  }
}

async function computePreferenceAlignment(user: any, target: any): Promise<number> {
  const prefs = [
    user.preferences?.location === target.location ? 0.3 : 0,
    user.preferences?.hourlyRate && target.hourlyRate
      ? 1 - Math.abs(user.preferences.hourlyRate - target.hourlyRate) / Math.max(user.preferences.hourlyRate, target.hourlyRate)
      : 0,
    user.preferences?.skills?.some((s: string) => target.skills?.includes(s)) ? 0.3 : 0,
  ];
  return Math.min(1, prefs.reduce((a, b) => a + b, 0) / prefs.length);
}

async function computeSuccessHistory(userId: string, targetId: string): Promise<number> {
  const successfulMatches = await prisma.shift.count({
    where: {
      assignments: {
        some: {
          userId: userId,
          confirmed: true,
          completedAt: { not: null },
        },
      },
    },
  });

  return Math.min(1, successfulMatches / 50);
}

async function computeChurnRisk(userId: string, targetId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 0.5;

  const daysSinceLastActivity = Math.floor((Date.now() - (user.lastActivityAt?.getTime() ?? 0)) / 86400000);
  const churnScore = Math.min(1, daysSinceLastActivity / 90);

  return 1 - churnScore;
}

async function computeFairnessScore(userId: string, targetId: string): Promise<number> {
  const userMatches = await prisma.shift.count({
    where: { assignments: { some: { userId } } },
  });

  const targetMatches = await prisma.shift.count({
    where: { assignments: { some: { userId: targetId } } },
  });

  const disparity = Math.abs(userMatches - targetMatches) / Math.max(userMatches, targetMatches, 1);
  return 1 - Math.min(1, disparity);
}

export async function getRecommendations(userId: string, limit: number = 10): Promise<MatchScore[]> {
  try {
    const users = await prisma.user.findMany({ where: { id: { not: userId } }, take: limit * 2 });
    const scores = await Promise.all(
      users.map(u => computeMatchScore(userId, u.id))
    );

    return scores.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch (err) {
    logger.error("Recommendation computation failed", { userId, err });
    throw err;
  }
}
