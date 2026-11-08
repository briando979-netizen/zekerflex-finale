import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { LoyaltyPoints } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Subsystem 3: Loyalty Program
//
// Points accumulation, tier management, rewards catalog, and gamification
// for customer retention and engagement.
// ---------------------------------------------------------------------------

export const PointsActivitySchema = z.object({
  customerId: z.string(),
  points: z.number().int().min(1),
  activity: z.string(), // e.g., "purchase", "referral", "milestone", "activity"
  transactionId: z.string().optional(),
});

export type PointsActivityInput = z.infer<typeof PointsActivitySchema>;

const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 500,
  gold: 2000,
  platinum: 5000,
};

const POINTS_PER_ACTIVITY = {
  purchase_100: 100,
  purchase_1000: 1000,
  referral: 500,
  review: 50,
  social_share: 25,
  referral_success: 250,
};

/**
 * Get or create loyalty points record for a customer.
 */
export async function getOrCreateLoyaltyPoints(customerId: string): Promise<LoyaltyPoints> {
  let loyalty = await prisma.loyaltyPoints.findUnique({
    where: { customerId },
  });

  if (!loyalty) {
    loyalty = await prisma.loyaltyPoints.create({
      data: { customerId },
    });
  }

  return loyalty;
}

/**
 * Determine customer tier based on lifetime points.
 */
export function determineTier(lifetimePoints: number): "bronze" | "silver" | "gold" | "platinum" {
  if (lifetimePoints >= TIER_THRESHOLDS.platinum) return "platinum";
  if (lifetimePoints >= TIER_THRESHOLDS.gold) return "gold";
  if (lifetimePoints >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

/**
 * Add points to customer account.
 */
export async function addPoints(input: PointsActivityInput): Promise<LoyaltyPoints> {
  try {
    const validated = PointsActivitySchema.parse(input);

    const loyalty = await getOrCreateLoyaltyPoints(validated.customerId);

    const updatedAvailable = loyalty.availablePoints + validated.points;
    const updatedLifetime = loyalty.lifetimePoints + validated.points;
    const currentMonth = new Date().toISOString().substring(0, 7);
    const loyaltyMonth = loyalty.updatedAt.toISOString().substring(0, 7);
    const pointsThisMonth = currentMonth === loyaltyMonth ? loyalty.pointsThisMonth + validated.points : validated.points;

    const newTier = determineTier(updatedLifetime);
    const prevTier = loyalty.tier;

    const data: any = {
      availablePoints: updatedAvailable,
      lifetimePoints: updatedLifetime,
      pointsThisMonth,
      tier: newTier,
    };

    // Track tier qualification date
    if (newTier !== prevTier && !loyalty.tierQualifiedAt) {
      data.tierQualifiedAt = new Date();
      data.tierExpireAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    }

    const updated = await prisma.loyaltyPoints.update({
      where: { customerId: validated.customerId },
      data,
    });

    if (newTier !== prevTier) {
      logger.info("Customer promoted to new tier", {
        customerId: validated.customerId,
        fromTier: prevTier,
        toTier: newTier,
        points: updated.lifetimePoints,
      });
    }

    logger.debug("Points added", {
      customerId: validated.customerId,
      points: validated.points,
      activity: validated.activity,
      total: updated.availablePoints,
    });

    return updated;
  } catch (err) {
    logger.error("Failed to add points", {
      error: (err as Error).message,
    });
    throw AppError.internal("Puntentoekenning mislukt.");
  }
}

/**
 * Redeem points for reward.
 */
export async function redeemPoints(
  customerId: string,
  points: number,
  rewardId: string,
): Promise<LoyaltyPoints> {
  try {
    const loyalty = await getOrCreateLoyaltyPoints(customerId);

    if (loyalty.availablePoints < points) {
      throw AppError.forbidden("Onvoldoende punten beschikbaar.");
    }

    const updated = await prisma.loyaltyPoints.update({
      where: { customerId },
      data: {
        availablePoints: loyalty.availablePoints - points,
        redeemedPoints: loyalty.redeemedPoints + points,
        pendingRewards: [...loyalty.pendingRewards, rewardId],
      },
    });

    logger.info("Points redeemed", {
      customerId,
      points,
      rewardId,
      remaining: updated.availablePoints,
    });

    return updated;
  } catch (err) {
    logger.error("Failed to redeem points", {
      error: (err as Error).message,
    });
    throw AppError.validation("Puntenwisseling mislukt.");
  }
}

/**
 * Award achievement/badge to customer.
 */
export async function awardBadge(customerId: string, badgeName: string): Promise<LoyaltyPoints> {
  const loyalty = await getOrCreateLoyaltyPoints(customerId);

  if (loyalty.badges.includes(badgeName)) {
    return loyalty; // Already has badge
  }

  const updated = await prisma.loyaltyPoints.update({
    where: { customerId },
    data: {
      badges: [...loyalty.badges, badgeName],
    },
  });

  logger.info("Badge awarded", {
    customerId,
    badge: badgeName,
  });

  return updated;
}

/**
 * Record achievement milestone.
 */
export async function recordAchievement(customerId: string, achievementName: string): Promise<LoyaltyPoints> {
  const loyalty = await getOrCreateLoyaltyPoints(customerId);

  if (loyalty.achievements.includes(achievementName)) {
    return loyalty; // Already achieved
  }

  const updated = await prisma.loyaltyPoints.update({
    where: { customerId },
    data: {
      achievements: [...loyalty.achievements, achievementName],
    },
  });

  logger.info("Achievement recorded", {
    customerId,
    achievement: achievementName,
  });

  return updated;
}

/**
 * Get loyalty summary for a customer.
 */
export async function getLoyaltySummary(customerId: string): Promise<{
  loyalty: LoyaltyPoints;
  tier_name: string;
  points_to_next_tier: number;
  available_rewards: string[];
  badges: string[];
  achievements: string[];
}> {
  const loyalty = await getOrCreateLoyaltyPoints(customerId);

  const nextTierThreshold =
    loyalty.tier === "platinum"
      ? TIER_THRESHOLDS.platinum + 5000
      : TIER_THRESHOLDS[loyalty.tier === "bronze" ? "silver" : loyalty.tier === "silver" ? "gold" : "platinum"];

  const pointsToNext = Math.max(0, nextTierThreshold - loyalty.lifetimePoints);

  return {
    loyalty,
    tier_name: loyalty.tier.toUpperCase(),
    points_to_next_tier: pointsToNext,
    available_rewards: loyalty.pendingRewards,
    badges: loyalty.badges,
    achievements: loyalty.achievements,
  };
}

/**
 * Get all platinum tier customers.
 */
export async function getPlatinumMembers(limit = 50): Promise<LoyaltyPoints[]> {
  return prisma.loyaltyPoints.findMany({
    where: {
      tier: "platinum",
    },
    orderBy: { lifetimePoints: "desc" },
    take: limit,
  });
}

/**
 * Generate loyalty program report.
 */
export async function generateLoyaltyReport(): Promise<{
  total_members: number;
  by_tier: Record<string, number>;
  total_points_awarded: number;
  total_points_redeemed: number;
  avg_points_per_member: number;
  top_achievements: Record<string, number>;
}> {
  const members = await prisma.loyaltyPoints.findMany();

  const byTier = {
    bronze: 0,
    silver: 0,
    gold: 0,
    platinum: 0,
  };

  let totalAwarded = 0;
  let totalRedeemed = 0;
  const achievementCounts: Record<string, number> = {};

  for (const member of members) {
    byTier[member.tier] += 1;
    totalAwarded += member.lifetimePoints;
    totalRedeemed += member.redeemedPoints;

    for (const achievement of member.achievements) {
      achievementCounts[achievement] = (achievementCounts[achievement] ?? 0) + 1;
    }
  }

  const avgPoints = members.length > 0 ? Math.round(totalAwarded / members.length) : 0;

  const topAchievements = Object.fromEntries(
    Object.entries(achievementCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5),
  );

  logger.info("Loyalty report generated", {
    total: members.length,
    totalAwarded,
    totalRedeemed,
  });

  return {
    total_members: members.length,
    by_tier: byTier,
    total_points_awarded: totalAwarded,
    total_points_redeemed: totalRedeemed,
    avg_points_per_member: avgPoints,
    top_achievements: topAchievements,
  };
}

/**
 * Calculate tier benefits for display.
 */
export function getTierBenefits(tier: "bronze" | "silver" | "gold" | "platinum"): {
  name: string;
  benefits: string[];
  pointsThreshold: number;
}[] {
  const benefits: Record<string, { name: string; benefits: string[]; pointsThreshold: number }[]> = {
    bronze: [
      {
        name: "Bronze",
        benefits: ["1 punt per euro", "Maandelijkse wedstrijden"],
        pointsThreshold: 0,
      },
    ],
    silver: [
      {
        name: "Silver",
        benefits: ["1.25 punten per euro", "Vroeg toegang tot aanbiedingen", "Gratis verzending"],
        pointsThreshold: 500,
      },
    ],
    gold: [
      {
        name: "Gold",
        benefits: ["1.5 punten per euro", "Persoonlijke manager", "Exclusieve aanbiedingen", "Prioriteitsondersteuning"],
        pointsThreshold: 2000,
      },
    ],
    platinum: [
      {
        name: "Platinum",
        benefits: ["2 punten per euro", "VIP-evenementen", "Doorgestuurde aanbiedingen", "Gratis upgrade"],
        pointsThreshold: 5000,
      },
    ],
  };

  return benefits[tier] ?? benefits.bronze;
}
