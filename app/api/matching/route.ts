import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { scoreSkillMatch, batchScoreSkillMatches } from "@/lib/matching/skill-engine";
import { checkAvailability, batchCheckAvailability } from "@/lib/matching/availability-engine";
import { matchLocationForFreelancer, batchMatchLocation } from "@/lib/matching/location-engine";
import { forecastDemand, findUndersuppliedSkills } from "@/lib/matching/demand-forecast";
import { calculateDynamicPricing, recommendPricingStrategy } from "@/lib/matching/pricing-engine";
import { generateQualityScore, batchGenerateQualityScores } from "@/lib/matching/quality-scoring";

export const dynamic = "force-dynamic";

/**
 * Request schema for matching query.
 */
const matchingRequestSchema = z.object({
  shiftId: z.string(),
  action: z.enum(["score", "analyze_demand", "price", "quality", "comprehensive"]).optional().default("comprehensive"),
});

/**
 * GET /api/matching?shiftId=...&action=...
 * Orchestrates all matching subsystems for a specific shift.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();

    const params = {
      shiftId: request.nextUrl.searchParams.get("shiftId"),
      action: (request.nextUrl.searchParams.get("action") as string) ?? "comprehensive",
    };

    const input = matchingRequestSchema.parse(params);

    // Fetch shift details
    const shift = await prisma.shift.findUnique({
      where: { id: input.shiftId },
      include: {
        branch: true,
        requiredSkill: true,
      },
    });

    if (!shift) {
      throw AppError.notFound("Shift not found");
    }

    let result = {};

    switch (input.action) {
      case "score": {
        result = await performSkillMatching(shift);
        break;
      }
      case "analyze_demand": {
        result = await analyzeDemand(shift);
        break;
      }
      case "price": {
        result = await recommendPricing(shift);
        break;
      }
      case "quality": {
        result = await analyzeWorkerQuality();
        break;
      }
      case "comprehensive":
      default: {
        const [skillResults, demandAnalysis, pricingRecommendation, qualityAnalysis] = await Promise.all([
          performSkillMatching(shift),
          analyzeDemand(shift),
          recommendPricing(shift),
          analyzeWorkerQuality(),
        ]);

        result = {
          shiftId: shift.id,
          skillMatching: skillResults,
          demandAnalysis,
          pricingRecommendation,
          qualityAnalysis,
        };
        break;
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/matching
 * Execute a matching algorithm and save results.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();

    const body = await request.json();
    const input = matchingRequestSchema.parse(body);

    const shift = await prisma.shift.findUnique({
      where: { id: input.shiftId },
      include: { branch: true, requiredSkill: true },
    });

    if (!shift) {
      throw AppError.notFound("Shift not found");
    }

    // Execute comprehensive matching
    const skillResults = await performSkillMatching(shift);
    const demandAnalysis = await analyzeDemand(shift);
    const pricingRecommendation = await recommendPricing(shift);

    // Store matching results (optional — for analytics/auditing)
    await prisma.auditLog.create({
      data: {
        action: "MATCHING_EXECUTED",
        entityType: "Shift",
        entityId: shift.id,
        details: {
          skillMatches: skillResults.topCandidates?.length ?? 0,
          demandForecast: demandAnalysis.forecast?.forecastedDemand ?? 0,
          recommendedRate: pricingRecommendation.recommendedPricing?.dynamicRateCents ?? 0,
        },
      },
    });

    return NextResponse.json({
      success: true,
      shiftId: shift.id,
      matchingResults: {
        skillMatching: skillResults,
        demandAnalysis,
        pricingRecommendation,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * Perform skill-based matching for a shift.
 */
async function performSkillMatching(shift: any): Promise<{
  topCandidates: Array<{
    freelancerId: string;
    skillMatchScore: number;
    qualityTier: string;
  }> | null;
  matchCount: number;
}> {
  if (!shift.requiredSkillId) {
    return { topCandidates: null, matchCount: 0 };
  }

  // Find all freelancers with the required skill
  const withSkill = await prisma.freelancerSkill.findMany({
    where: { skillId: shift.requiredSkillId },
    select: { freelancerId: true },
    take: 100,
  });

  if (withSkill.length === 0) {
    return { topCandidates: null, matchCount: 0 };
  }

  const freelancerIds = withSkill.map((f) => f.freelancerId);

  // Score all candidates
  const skillScores = await batchScoreSkillMatches(freelancerIds, shift.requiredSkillId);

  // Get quality scores for ranking
  const qualityScores = await batchGenerateQualityScores(freelancerIds);

  // Rank and return top 10
  const topCandidates = skillScores
    .filter((s) => s.matchScore >= 0.5)
    .slice(0, 10)
    .map((s) => {
      const quality = qualityScores.get(s.requiredSkillId);
      return {
        freelancerId: s.freelancerId,
        skillMatchScore: s.matchScore,
        qualityTier: quality?.tier ?? "BRONZE",
      };
    });

  return {
    topCandidates: topCandidates.length > 0 ? topCandidates : null,
    matchCount: topCandidates.length,
  };
}

/**
 * Analyze demand for the shift's skill and timing.
 */
async function analyzeDemand(shift: any): Promise<{
  forecast: any | null;
  undersuppliedSkills: any[];
  urgency: string;
}> {
  const forecast = await forecastDemand(shift.requiredSkillId, shift.startsAt);

  const undersuppliedSkills = await findUndersuppliedSkills(7, 0.2);

  let urgency = "normal";
  if (forecast.confidence < 0.5) urgency = "uncertain";
  if (forecast.forecastedDemand > 10) urgency = "high";

  return {
    forecast,
    undersuppliedSkills: undersuppliedSkills.slice(0, 5),
    urgency,
  };
}

/**
 * Recommend dynamic pricing for the shift.
 */
async function recommendPricing(shift: any): Promise<{
  recommendedPricing: any;
  urgency: string;
  suggestedStrategy: string;
}> {
  const minutesUntilStart = (shift.startsAt.getTime() - new Date().getTime()) / (1000 * 60);

  const recommendation = await recommendPricingStrategy(
    shift.hourlyRateCents,
    shift.requiredSkillId,
    shift.startsAt,
    shift.positions,
    minutesUntilStart,
  );

  return {
    recommendedPricing: recommendation.recommendedPricing,
    urgency: recommendation.urgency,
    suggestedStrategy: recommendation.suggestedStrategy,
  };
}

/**
 * Analyze workforce quality metrics.
 */
async function analyzeWorkerQuality(): Promise<{
  topTierWorkers: number;
  averageScore: number;
  atRiskWorkers: number;
}> {
  const [topTier, all, atRisk] = await Promise.all([
    prisma.freelancerProfile.count({ where: { badgeLevel: { in: ["GOLD", "PLATINUM"] } } }),
    prisma.freelancerProfile.findMany({
      select: { id: true },
      take: 100,
    }),
    prisma.freelancerProfile.count({
      where: {
        badgeLevel: { not: "BRONZE" },
        // This would require a computed field or subquery in real implementation
      },
    }),
  ]);

  let totalScore = 0;
  for (const freelancer of all) {
    const score = await generateQualityScore(freelancer.id);
    totalScore += score.overallScore;
  }

  const averageScore = all.length > 0 ? totalScore / all.length : 0;

  return {
    topTierWorkers: topTier,
    averageScore: Math.round(averageScore),
    atRiskWorkers: atRisk,
  };
}
