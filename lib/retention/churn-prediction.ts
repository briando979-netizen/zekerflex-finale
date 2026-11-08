import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { ChurnRisk } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Subsystem 1: Churn Prediction
//
// ML-based scoring, behavioral signals, risk levels, and early warning system.
// Tracks RFM metrics and identifies at-risk customers before they churn.
// ---------------------------------------------------------------------------

export const ChurnAssessmentSchema = z.object({
  customerId: z.string(),
  daysSinceLastActivity: z.number().int().min(0),
  activeFeatureCount: z.number().int().min(0),
  supportTicketsLast30d: z.number().int().min(0),
  usageDecline: z.boolean().default(false),
});

export type ChurnAssessmentInput = z.infer<typeof ChurnAssessmentSchema>;

const RISK_WEIGHTS = {
  recency: 40,    // Most recent activity heavily weighted
  frequency: 30,  // Usage patterns
  monetary: 20,   // Revenue importance
  behavioral: 10, // Support issues, usage decline
};

/**
 * Calculate RFM scores (0-100 scale).
 */
function calculateRFMScores(input: {
  daysSinceLastActivity: number;
  activeFeatureCount: number;
}) {
  // Recency: 0 days = 100, 90+ days = 0
  const recencyScore = Math.max(0, 100 - (input.daysSinceLastActivity / 90) * 100);

  // Frequency: 0 features = 0, 15+ features = 100
  const frequencyScore = Math.min(100, (input.activeFeatureCount / 15) * 100);

  return { recencyScore: Math.round(recencyScore), frequencyScore: Math.round(frequencyScore) };
}

/**
 * Identify risk factors.
 */
function identifyRiskFactors(input: {
  daysSinceLastActivity: number;
  supportTicketsLast30d: number;
  usageDecline: boolean;
  recencyScore: number;
  frequencyScore: number;
}): string[] {
  const factors: string[] = [];

  if (input.daysSinceLastActivity > 30) factors.push("inactive");
  if (input.daysSinceLastActivity > 60) factors.push("dormant");
  if (input.usageDecline) factors.push("declining");
  if (input.supportTicketsLast30d > 5) factors.push("support_issues");
  if (input.recencyScore < 30) factors.push("no_recent_activity");
  if (input.frequencyScore < 20) factors.push("low_engagement");

  return [...new Set(factors)];
}

/**
 * Calculate overall churn risk score (0-100).
 */
export function calculateChurnScore(
  rfm: { recencyScore: number; frequencyScore: number },
  monetary: number,
  factors: string[],
): number {
  let score = 0;

  // Base RFM calculation (0-100)
  score =
    (rfm.recencyScore * RISK_WEIGHTS.recency) / 100 +
    (rfm.frequencyScore * RISK_WEIGHTS.frequency) / 100 +
    (monetary * RISK_WEIGHTS.monetary) / 100;

  // Apply behavioral risk multiplier
  if (factors.length > 0) {
    const behavioralPenalty = Math.min(20, factors.length * 3);
    score = Math.max(score, score + behavioralPenalty / 2);
  }

  return Math.min(100, Math.round(score));
}

/**
 * Determine risk level from score.
 */
export function determineRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Get or create churn risk record for a customer.
 */
export async function getOrCreateChurnRisk(customerId: string): Promise<ChurnRisk> {
  let risk = await prisma.churnRisk.findUnique({
    where: { customerId },
  });

  if (!risk) {
    risk = await prisma.churnRisk.create({
      data: { customerId },
    });
  }

  return risk;
}

/**
 * Assess churn risk for a customer.
 */
export async function assessChurnRisk(input: ChurnAssessmentInput): Promise<ChurnRisk> {
  try {
    const validated = ChurnAssessmentSchema.parse(input);

    const rfm = calculateRFMScores({
      daysSinceLastActivity: validated.daysSinceLastActivity,
      activeFeatureCount: validated.activeFeatureCount,
    });

    // Monetary score: based on customer importance (simplified as frequency proxy)
    const monetaryScore = validated.activeFeatureCount > 0 ? 60 : 30;

    const riskFactors = identifyRiskFactors({
      daysSinceLastActivity: validated.daysSinceLastActivity,
      supportTicketsLast30d: validated.supportTicketsLast30d,
      usageDecline: validated.usageDecline,
      recencyScore: rfm.recencyScore,
      frequencyScore: rfm.frequencyScore,
    });

    const riskScore = calculateChurnScore(rfm, monetaryScore, riskFactors);
    const riskLevel = determineRiskLevel(riskScore);

    let risk = await prisma.churnRisk.findUnique({
      where: { customerId: validated.customerId },
    });

    const data = {
      recencyScore: rfm.recencyScore,
      frequencyScore: rfm.frequencyScore,
      monetaryScore,
      riskScore,
      riskLevel,
      riskFactors,
      daysSinceLastActivity: validated.daysSinceLastActivity,
      activeFeatureCount: validated.activeFeatureCount,
      supportTicketsLast30d: validated.supportTicketsLast30d,
      usageDecline: validated.usageDecline,
    };

    if (!risk) {
      risk = await prisma.churnRisk.create({
        data: { customerId: validated.customerId, ...data },
      });
    } else {
      risk = await prisma.churnRisk.update({
        where: { customerId: validated.customerId },
        data,
      });
    }

    if (riskLevel === "critical" && !risk.interventionSent) {
      logger.warn("High-risk customer detected", {
        customerId: validated.customerId,
        riskScore,
        riskFactors,
      });
    }

    return risk;
  } catch (err) {
    logger.error("Failed to assess churn risk", {
      error: (err as Error).message,
    });
    throw AppError.validation("Churnbeoordeling mislukt.");
  }
}

/**
 * Get churn risk for a customer.
 */
export async function getChurnRisk(customerId: string): Promise<ChurnRisk | null> {
  return prisma.churnRisk.findUnique({
    where: { customerId },
  });
}

/**
 * Get all critical risk customers.
 */
export async function getCriticalRiskCustomers(limit = 50): Promise<ChurnRisk[]> {
  return prisma.churnRisk.findMany({
    where: {
      riskLevel: "critical",
      interventionSent: false,
    },
    orderBy: { riskScore: "desc" },
    take: limit,
  });
}

/**
 * Get all high-risk customers.
 */
export async function getHighRiskCustomers(limit = 100): Promise<ChurnRisk[]> {
  return prisma.churnRisk.findMany({
    where: {
      riskLevel: { in: ["high", "critical"] },
    },
    orderBy: { riskScore: "desc" },
    take: limit,
  });
}

/**
 * Mark intervention as sent.
 */
export async function markInterventionSent(
  customerId: string,
  type: "email" | "call" | "offer" | "personal",
): Promise<ChurnRisk> {
  return prisma.churnRisk.update({
    where: { customerId },
    data: {
      interventionSent: true,
      interventionDate: new Date(),
      interventionType: type,
    },
  });
}

/**
 * Generate churn risk report.
 */
export async function generateChurnReport(): Promise<{
  total_assessed: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  avg_score: number;
  top_factors: Record<string, number>;
}> {
  const risks = await prisma.churnRisk.findMany();

  const critical = risks.filter((r) => r.riskLevel === "critical").length;
  const high = risks.filter((r) => r.riskLevel === "high").length;
  const medium = risks.filter((r) => r.riskLevel === "medium").length;
  const low = risks.filter((r) => r.riskLevel === "low").length;

  const avgScore = risks.length > 0 ? Math.round(risks.reduce((sum, r) => sum + r.riskScore, 0) / risks.length) : 0;

  const factorCounts: Record<string, number> = {};
  for (const risk of risks) {
    for (const factor of risk.riskFactors) {
      factorCounts[factor] = (factorCounts[factor] ?? 0) + 1;
    }
  }

  logger.info("Churn report generated", {
    total: risks.length,
    critical,
    high,
    avgScore,
  });

  return {
    total_assessed: risks.length,
    critical_count: critical,
    high_count: high,
    medium_count: medium,
    low_count: low,
    avg_score: avgScore,
    top_factors: Object.fromEntries(
      Object.entries(factorCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5),
    ),
  };
}
