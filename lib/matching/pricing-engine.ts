import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { calculateImbalance } from "@/lib/matching/demand-forecast";

/**
 * Dynamic pricing result with surge multipliers and recommendations.
 */
export interface DynamicPricing {
  baseRateCents: number;
  surgeMultiplier: number; // [0.8, 2.5]
  dynamicRateCents: number; // baseRate * surgeMultiplier
  factors: {
    demandSupplyRatio: number; // [0, 1]
    timeOfDay: number; // [0.8, 1.2]
    dayOfWeek: number; // [0.7, 1.3]
    skillScarcity: number; // [0.9, 1.5]
  };
  workerTierMultiplier: number; // Premium for high-rated workers
  recommendation: string;
}

/**
 * Calculate time-of-day multiplier for wage surges.
 * Morning rush, evening, and night shifts get premiums.
 */
function calculateTimeOfDayMultiplier(date: Date): number {
  const hour = date.getHours();

  // Night shift (22:00 - 05:59): +20%
  if (hour >= 22 || hour < 6) return 1.2;

  // Early morning (06:00 - 07:59): +10%
  if (hour >= 6 && hour < 8) return 1.1;

  // Peak hours (17:00 - 19:59): +15%
  if (hour >= 17 && hour < 20) return 1.15;

  // Off-peak (08:00 - 16:59): baseline
  return 1.0;
}

/**
 * Calculate day-of-week multiplier.
 * Weekends and holidays get premiums.
 */
function calculateDayOfWeekMultiplier(date: Date): number {
  const dayOfWeek = date.getDay(); // 0 = Sunday

  // Weekend: +30%
  if (dayOfWeek === 0 || dayOfWeek === 6) return 1.3;

  // Friday: +10%
  if (dayOfWeek === 5) return 1.1;

  // Weekdays: baseline
  return 1.0;
}

/**
 * Calculate skill scarcity multiplier.
 * Rare/specialized skills command premium wages.
 */
async function calculateSkillScarcityMultiplier(skillId: string | null): Promise<number> {
  if (!skillId) return 1.0;

  const workerCount = await prisma.freelancerSkill.count({
    where: { skillId },
  });

  // Scale: 0 workers = 1.5x, 100+ workers = 0.9x
  if (workerCount === 0) return 1.5;
  if (workerCount < 5) return 1.3;
  if (workerCount < 20) return 1.15;
  if (workerCount < 50) return 1.05;

  return 1.0;
}

/**
 * Calculate surge multiplier based on demand/supply imbalance.
 */
async function calculateSurgeMultiplier(skillId: string | null, date: Date): Promise<number> {
  const { imbalance } = await calculateImbalance(skillId, date);

  // Imbalance [-1, 1] maps to multiplier [0.8, 2.5]
  // 0 imbalance = 1.0x
  // +1 imbalance (severe undersupply) = 2.5x
  // -1 imbalance (severe oversupply) = 0.8x

  if (imbalance > 0) {
    // Undersupply: aggressive surge pricing
    return 1 + imbalance * 1.5;
  } else {
    // Oversupply: slight discount
    return Math.max(0.8, 1 + imbalance * 0.2);
  }
}

/**
 * Get worker tier multiplier based on their quality score.
 */
async function getWorkerTierMultiplier(freelancerId: string): Promise<number> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: freelancerId },
    select: { badgeLevel: true },
  });

  if (!profile) return 1.0;

  switch (profile.badgeLevel) {
    case "BRONZE":
      return 1.0;
    case "SILVER":
      return 1.05;
    case "GOLD":
      return 1.1;
    case "PLATINUM":
      return 1.15;
    default:
      return 1.0;
  }
}

/**
 * Calculate dynamic pricing for a shift.
 */
export async function calculateDynamicPricing(
  baseRateCents: number,
  skillId: string | null,
  shiftDate: Date,
  freelancerId?: string,
): Promise<DynamicPricing> {
  const timeMultiplier = calculateTimeOfDayMultiplier(shiftDate);
  const dayMultiplier = calculateDayOfWeekMultiplier(shiftDate);
  const skillMultiplier = await calculateSkillScarcityMultiplier(skillId);
  const surgeMultiplier = await calculateSurgeMultiplier(skillId, shiftDate);

  const { imbalance } = await calculateImbalance(skillId, shiftDate);
  const demandSupplyRatio = Math.max(0, Math.min(1, (imbalance + 1) / 2)); // Normalize [-1,1] to [0,1]

  let workerTierMultiplier = 1.0;
  if (freelancerId) {
    workerTierMultiplier = await getWorkerTierMultiplier(freelancerId);
  }

  // Combine all factors
  const combinedMultiplier = surgeMultiplier * timeMultiplier * dayMultiplier * skillMultiplier * workerTierMultiplier;
  const dynamicRateCents = Math.round(baseRateCents * combinedMultiplier);

  let recommendation = "Standaardtarief";
  if (surgeMultiplier > 1.3) {
    recommendation = "Ernstige personeelstekort — verhoog het tarief agressief";
  } else if (surgeMultiplier > 1.1) {
    recommendation = "Personeelstekort — verhoog het tarief gematigd";
  } else if (surgeMultiplier < 0.9) {
    recommendation = "Overschot aan personeel — verlager het tarief kan nuttig zijn";
  }

  return {
    baseRateCents,
    surgeMultiplier,
    dynamicRateCents,
    factors: {
      demandSupplyRatio,
      timeOfDay: timeMultiplier,
      dayOfWeek: dayMultiplier,
      skillScarcity: skillMultiplier,
    },
    workerTierMultiplier,
    recommendation,
  };
}

/**
 * Simulate price elasticity: estimate how a price change affects applications.
 * Higher premium → fewer applications (but higher revenue per position).
 */
function estimatePriceElasticity(surgeMultiplier: number): {
  applicationRate: number; // [0, 1] - baseline is 0.5
  expectedApplications: number; // per shift
} {
  // Simplified: elasticity coefficient -0.5
  // 1.0x multiplier = 0.5 baseline rate
  // 1.5x multiplier = 0.35 rate (30% fewer applications)
  // 0.8x multiplier = 0.6 rate (20% more applications)

  const baselineApplications = 0.5;
  const elasticity = -0.5;

  const applicationRate = baselineApplications * Math.pow(surgeMultiplier, elasticity);

  return {
    applicationRate,
    expectedApplications: Math.round(applicationRate * 100), // Assume 100 candidates per pool
  };
}

/**
 * Recommend pricing to fill a shift within time budget.
 */
export async function recommendPricingStrategy(
  baseRateCents: number,
  skillId: string | null,
  shiftDate: Date,
  positionsToFill: number,
  minutesUntilStart: number,
): Promise<{
  recommendedPricing: DynamicPricing;
  urgency: "immediate" | "soon" | "normal";
  suggestedStrategy: string;
}> {
  const pricing = await calculateDynamicPricing(baseRateCents, skillId, shiftDate);

  // Determine urgency
  let urgency: "immediate" | "soon" | "normal" = "normal";
  if (minutesUntilStart < 120) {
    urgency = "immediate";
  } else if (minutesUntilStart < 1440) {
    urgency = "soon";
  }

  // Estimate elasticity at current pricing
  const elasticity = estimatePriceElasticity(pricing.surgeMultiplier);

  // Strategy recommendations
  let suggestedStrategy = "Wacht op natuurlijke reacties";

  if (urgency === "immediate") {
    suggestedStrategy = `URGENT: Verhoog naar €${(pricing.dynamicRateCents / 100).toFixed(2)}/u — verwacht ~${elasticity.expectedApplications} reacties`;
  } else if (positionsToFill * 3 > elasticity.expectedApplications * minutesUntilStart) {
    // Not enough applications at current rate
    suggestedStrategy = `Verhoog naar €${(pricing.dynamicRateCents / 100).toFixed(2)}/u om meer reacties te trekken`;
  }

  return {
    recommendedPricing: pricing,
    urgency,
    suggestedStrategy,
  };
}

/**
 * Calculate revenue impact of dynamic pricing.
 */
export function estimateRevenueImpact(
  baseRateCents: number,
  positions: number,
  currentMultiplier: number,
  proposedMultiplier: number,
): {
  currentRevenue: number; // in cents
  proposedRevenue: number;
  revenueDelta: number;
  percentChange: number;
} {
  const currentRevenue = baseRateCents * positions * currentMultiplier;
  const proposedRevenue = baseRateCents * positions * proposedMultiplier;

  return {
    currentRevenue: Math.round(currentRevenue),
    proposedRevenue: Math.round(proposedRevenue),
    revenueDelta: Math.round(proposedRevenue - currentRevenue),
    percentChange: ((proposedRevenue - currentRevenue) / currentRevenue) * 100,
  };
}

/**
 * Historical pricing analysis for a skill.
 */
export async function analyzePricingHistory(
  skillId: string | null,
  days: number = 30,
): Promise<{
  avgRate: number;
  minRate: number;
  maxRate: number;
  avgSurge: number;
  volatility: number; // Standard deviation
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const shifts = await prisma.shift.findMany({
    where: {
      requiredSkillId: skillId ?? undefined,
      createdAt: { gte: cutoffDate },
    },
    select: {
      hourlyRateCents: true,
      createdAt: true,
    },
  });

  if (shifts.length === 0) {
    return {
      avgRate: 0,
      minRate: 0,
      maxRate: 0,
      avgSurge: 1.0,
      volatility: 0,
    };
  }

  const rates = shifts.map((s) => s.hourlyRateCents);
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);

  const variance = rates.reduce((sum, r) => sum + (r - avgRate) ** 2, 0) / rates.length;
  const volatility = Math.sqrt(variance);

  const avgSurge = avgRate / (minRate || 1);

  return {
    avgRate: Math.round(avgRate),
    minRate,
    maxRate,
    avgSurge,
    volatility: Math.round(volatility),
  };
}
