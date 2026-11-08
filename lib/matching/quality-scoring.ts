import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Worker quality metrics and scoring.
 */
export interface QualityScore {
  freelancerId: string;
  overallScore: number; // [0, 100]
  completion: {
    completionRate: number; // [0, 1]
    totalShifts: number;
    cancelledShifts: number;
    noShowShifts: number;
  };
  reliability: {
    punctualityScore: number; // [0, 1]
    onTimeArrivals: number;
    lateArrivals: number;
    earlyArrivals: number;
  };
  quality: {
    avgRating: number; // [0, 5]
    totalReviews: number;
    ratingDistribution: Record<number, number>; // count per star
  };
  engagement: {
    responseRate: number; // [0, 1]
    acceptanceRate: number; // [0, 1]
    repeats: number; // with same employer
  };
  tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  trend: "improving" | "stable" | "declining";
}

/**
 * Calculate completion metrics.
 */
async function calculateCompletion(freelancerId: string): Promise<{
  completionRate: number;
  totalShifts: number;
  cancelledShifts: number;
  noShowShifts: number;
}> {
  const [total, completed, cancelled, noShow] = await Promise.all([
    prisma.shiftAssignment.count({
      where: { freelancerId },
    }),
    prisma.shiftAssignment.count({
      where: {
        freelancerId,
        status: "COMPLETED",
      },
    }),
    prisma.shiftAssignment.count({
      where: {
        freelancerId,
        status: "CANCELLED",
      },
    }),
    prisma.shiftAssignment.count({
      where: {
        freelancerId,
        status: "NO_SHOW",
      },
    }),
  ]);

  return {
    completionRate: total > 0 ? completed / total : 0,
    totalShifts: total,
    cancelledShifts: cancelled,
    noShowShifts: noShow,
  };
}

/**
 * Calculate punctuality metrics from timesheet/GPS data.
 */
async function calculatePunctuality(freelancerId: string): Promise<{
  punctualityScore: number;
  onTimeArrivals: number;
  lateArrivals: number;
  earlyArrivals: number;
}> {
  // Get GPS events for this freelancer's completed shifts
  const gpsEvents = await prisma.gpsEvent.findMany({
    where: {
      freelancerId,
      type: "ARRIVAL",
    },
    include: {
      shift: true,
    },
  });

  let onTime = 0;
  let late = 0;
  let early = 0;

  for (const event of gpsEvents) {
    if (!event.timestamp || !event.shift.startsAt) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const minutesBeforeStart = (event.shift.startsAt.getTime() - event.timestamp.getTime()) / (1000 * 60);

    if (minutesBeforeStart >= 5) {
      // At least 5 min early
      early += 1;
    } else if (minutesBeforeStart >= -5) {
      // Within 5 min window
      onTime += 1;
    } else {
      // More than 5 min late
      late += 1;
    }
  }

  const total = onTime + late + early;
  const punctualityScore = total > 0 ? (onTime + early * 0.5) / total : 0.5; // Generous for early

  return {
    punctualityScore: Math.min(1, punctualityScore),
    onTimeArrivals: onTime,
    lateArrivals: late,
    earlyArrivals: early,
  };
}

/**
 * Calculate quality metrics from reviews.
 */
async function calculateQuality(freelancerId: string): Promise<{
  avgRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>;
}> {
  const reviews = await prisma.shiftReview.findMany({
    where: {
      shiftAssignment: { freelancerId },
    },
    select: { rating: true },
  });

  if (reviews.length === 0) {
    return {
      avgRating: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    distribution[review.rating] = (distribution[review.rating] ?? 0) + 1;
  }

  return {
    avgRating,
    totalReviews: reviews.length,
    ratingDistribution: distribution,
  };
}

/**
 * Calculate engagement metrics.
 */
async function calculateEngagement(freelancerId: string): Promise<{
  responseRate: number;
  acceptanceRate: number;
  repeats: number;
}> {
  const [matches, accepted, uniqueEmployers] = await Promise.all([
    prisma.shiftMatch.count({
      where: { freelancerId },
    }),
    prisma.shiftMatch.count({
      where: {
        freelancerId,
        status: "ACCEPTED",
      },
    }),
    prisma.shiftAssignment.findMany({
      where: { freelancerId },
      distinct: ["shift"],
      select: { shift: { select: { branchId: true } } },
    }),
  ]);

  const responseRate = matches > 0 ? accepted / matches : 0;

  // Count repeats (assignments to same branch)
  const branchCounts: Record<string, number> = {};
  for (const assignment of uniqueEmployers) {
    const branchId = assignment.shift.branchId;
    branchCounts[branchId] = (branchCounts[branchId] ?? 0) + 1;
  }

  const repeats = Object.values(branchCounts).filter((count) => count > 1).length;

  return {
    responseRate: Math.min(1, responseRate),
    acceptanceRate: Math.min(1, responseRate), // Same as response rate
    repeats,
  };
}

/**
 * Determine badge tier based on metrics.
 */
function determineBadgeTier(completion: number, punctuality: number, rating: number): "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" {
  const score = completion * 0.4 + punctuality * 0.3 + (rating / 5) * 0.3;

  if (score >= 0.92) return "PLATINUM";
  if (score >= 0.85) return "GOLD";
  if (score >= 0.75) return "SILVER";
  return "BRONZE";
}

/**
 * Calculate overall quality score.
 */
function calculateOverallScore(
  completion: number,
  punctuality: number,
  quality: number,
  engagement: number,
): number {
  const weights = {
    completion: 0.35,
    punctuality: 0.25,
    quality: 0.25,
    engagement: 0.15,
  };

  const score =
    completion * weights.completion +
    punctuality * weights.punctuality +
    (quality / 5) * weights.quality +
    engagement * weights.engagement;

  return Math.round(score * 100);
}

/**
 * Determine trend by comparing recent vs historical scores.
 */
async function determineTrend(freelancerId: string): Promise<"improving" | "stable" | "declining"> {
  const now = new Date();
  const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentReviews = await prisma.shiftReview.findMany({
    where: {
      shiftAssignment: { freelancerId },
      createdAt: { gte: oneMonthAgo },
    },
    select: { rating: true },
  });

  const historicalReviews = await prisma.shiftReview.findMany({
    where: {
      shiftAssignment: { freelancerId },
      createdAt: {
        gte: twoMonthsAgo,
        lt: oneMonthAgo,
      },
    },
    select: { rating: true },
  });

  if (recentReviews.length === 0 || historicalReviews.length === 0) {
    return "stable";
  }

  const recentAvg = recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length;
  const historicalAvg = historicalReviews.reduce((sum, r) => sum + r.rating, 0) / historicalReviews.length;

  const diff = recentAvg - historicalAvg;

  if (diff > 0.3) return "improving";
  if (diff < -0.3) return "declining";
  return "stable";
}

/**
 * Generate complete quality score for a freelancer.
 */
export async function generateQualityScore(freelancerId: string): Promise<QualityScore> {
  const [completion, reliability, quality, engagement] = await Promise.all([
    calculateCompletion(freelancerId),
    calculatePunctuality(freelancerId),
    calculateQuality(freelancerId),
    calculateEngagement(freelancerId),
  ]);

  const tier = determineBadgeTier(completion.completionRate, reliability.punctualityScore, quality.avgRating);
  const overallScore = calculateOverallScore(
    completion.completionRate,
    reliability.punctualityScore,
    quality.avgRating,
    engagement.acceptanceRate,
  );
  const trend = await determineTrend(freelancerId);

  return {
    freelancerId,
    overallScore,
    completion,
    reliability,
    quality,
    engagement,
    tier,
    trend,
  };
}

/**
 * Batch generate quality scores for multiple freelancers.
 */
export async function batchGenerateQualityScores(
  freelancerIds: string[],
): Promise<Map<string, QualityScore>> {
  const results = new Map<string, QualityScore>();

  const scores = await Promise.all(freelancerIds.map((fid) => generateQualityScore(fid)));

  for (let i = 0; i < freelancerIds.length; i += 1) {
    results.set(freelancerIds[i], scores[i]);
  }

  return results;
}

/**
 * Get top performers by tier.
 */
export async function getTopPerformers(
  tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" = "GOLD",
  limit: number = 50,
): Promise<QualityScore[]> {
  const freelancers = await prisma.freelancerProfile.findMany({
    where: {
      badgeLevel: tier,
    },
    select: { id: true },
    take: limit,
  });

  const scores = await Promise.all(freelancers.map((f) => generateQualityScore(f.id)));

  return scores.sort((a, b) => b.overallScore - a.overallScore);
}

/**
 * Find workers at risk of losing tier (declining trend + low score).
 */
export async function findAtRiskWorkers(
  scoreThreshold: number = 70,
): Promise<
  Array<{
    freelancerId: string;
    score: number;
    trend: string;
    recommendation: string;
  }>
> {
  const allFreelancers = await prisma.freelancerProfile.findMany({
    where: { badgeLevel: { not: "BRONZE" } }, // Only check non-BRONZE
    select: { id: true },
  });

  const atRisk: Array<{
    freelancerId: string;
    score: number;
    trend: string;
    recommendation: string;
  }> = [];

  for (const freelancer of allFreelancers) {
    const qualityScore = await generateQualityScore(freelancer.id);

    if (qualityScore.overallScore < scoreThreshold && qualityScore.trend === "declining") {
      atRisk.push({
        freelancerId: freelancer.id,
        score: qualityScore.overallScore,
        trend: qualityScore.trend,
        recommendation: `Werkgever contact — score van ${qualityScore.overallScore} en ${qualityScore.trend} trend`,
      });
    }
  }

  return atRisk.sort((a, b) => a.score - b.score);
}

/**
 * Calculate skill-specific quality score.
 */
export async function getSkillQualityScore(
  freelancerId: string,
  skillId: string,
): Promise<{
  skillId: string;
  avgRating: number;
  reviewCount: number;
  experienceLevel: number;
  successRate: number;
}> {
  const [reviews, assignments] = await Promise.all([
    prisma.shiftReview.findMany({
      where: {
        shiftAssignment: {
          freelancerId,
          shift: {
            requiredSkillId: skillId,
          },
        },
      },
      select: { rating: true },
    }),
    prisma.shiftAssignment.count({
      where: {
        freelancerId,
        shift: {
          requiredSkillId: skillId,
        },
        status: "COMPLETED",
      },
    }),
  ]);

  const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  // Experience level based on completed shifts with this skill
  let experienceLevel = 0;
  if (assignments > 50) experienceLevel = 5;
  else if (assignments > 20) experienceLevel = 4;
  else if (assignments > 10) experienceLevel = 3;
  else if (assignments > 3) experienceLevel = 2;
  else if (assignments > 0) experienceLevel = 1;

  const successRate = assignments > 0 ? (reviews.length / assignments) * 100 : 0;

  return {
    skillId,
    avgRating,
    reviewCount: reviews.length,
    experienceLevel,
    successRate,
  };
}
