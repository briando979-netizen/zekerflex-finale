import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { chatJson } from "@/lib/ai/client";

/**
 * Lead Scoring — Qualification algorithm (company size, activity, engagement)
 * Subsystem 2 of 6 in the Sales Funnel Engine
 */

export interface ScoringFactors {
  visitCount: number;
  engagementMinutes: number;
  formFills: number;
  emailOpens: number;
  linkClicks: number;
  companySize?: string | undefined;
  industry?: string | undefined;
  kvkNumber?: string | undefined;
}

export type QualificationRating =
  | "UNQUALIFIED"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "HOT";

/**
 * Calculate heuristic lead score based on engagement & company signals.
 */
function calculateHeuristicScore(factors: ScoringFactors): {
  engagementScore: number;
  companyScore: number;
  activityScore: number;
  totalScore: number;
  rating: QualificationRating;
} {
  // Engagement score (0-100): visits, form fills, email opens
  const engagementScore = Math.min(
    100,
    (factors.visitCount * 5 +
      factors.formFills * 20 +
      factors.emailOpens * 15 +
      factors.linkClicks * 10) /
      2,
  );

  // Company score (0-100): size, industry fit
  let companyScore = 50; // baseline
  if (factors.companySize === "11-50") companyScore = 70;
  if (factors.companySize === "51-200") companyScore = 85;
  if (factors.companySize === "200+") companyScore = 95;

  // Activity score (0-100): recent engagement
  const activityScore = Math.min(
    100,
    factors.engagementMinutes > 0 ? 60 : 30,
  );

  // Total score: weighted average
  const totalScore = Math.round(
    engagementScore * 0.4 + companyScore * 0.4 + activityScore * 0.2,
  );

  // Rating
  let rating: QualificationRating = "UNQUALIFIED";
  if (totalScore >= 80) rating = "HOT";
  else if (totalScore >= 60) rating = "HIGH";
  else if (totalScore >= 40) rating = "MEDIUM";
  else if (totalScore >= 20) rating = "LOW";

  return {
    engagementScore,
    companyScore,
    activityScore,
    totalScore,
    rating,
  };
}

/**
 * Score a lead using LLM (with fallback to heuristic).
 */
export async function scoreLead(
  leadId: string,
  factors: ScoringFactors,
  useAi: boolean = false,
): Promise<{ score: number; rating: QualificationRating; reasoning: string }> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  let score: number;
  let rating: QualificationRating;
  let reasoning: string;
  let model: string;

  if (useAi) {
    try {
      // Use LLM for intelligent scoring
      const prompt = `
      Score deze lead voor de verkooppijplijn (0-100):
      - Naam: ${lead.name || "onbekend"}
      - Bedrijf: ${lead.company || "onbekend"}
      - Bedrijfsgrootte: ${factors.companySize || "onbekend"}
      - Sector: ${factors.industry || "onbekend"}
      - Website bezoeken: ${factors.visitCount}
      - Formulieren ingevuld: ${factors.formFills}
      - E-mails geopend: ${factors.emailOpens}
      - Links geklikt: ${factors.linkClicks}
      - Engagement minuten: ${factors.engagementMinutes}

      Geef een JSON antwoord met:
      {
        "score": 0-100,
        "rating": "UNQUALIFIED" | "LOW" | "MEDIUM" | "HIGH" | "HOT",
        "reasoning": "korte uitleg van de score"
      }`;

      const aiResponse = await chatJson(
        prompt,
        "Score deze lead",
        "claude-3-5-sonnet-20241022",
      );

      score = Math.max(0, Math.min(100, aiResponse.score ?? 0));
      rating = (aiResponse.rating as QualificationRating) ?? "MEDIUM";
      reasoning = aiResponse.reasoning ?? "LLM-beoordeling";
      model = "llm";
    } catch (error) {
      logger.warn("LLM scoring failed, falling back to heuristic", { leadId });
      // Fall back to heuristic
      const heuristic = calculateHeuristicScore(factors);
      score = heuristic.totalScore;
      rating = heuristic.rating;
      reasoning = "Heuristische fallback";
      model = "hybrid";
    }
  } else {
    // Use heuristic scoring
    const heuristic = calculateHeuristicScore(factors);
    score = heuristic.totalScore;
    rating = heuristic.rating;
    reasoning = `Engagement: ${heuristic.engagementScore}, Bedrijf: ${heuristic.companyScore}, Activiteit: ${heuristic.activityScore}`;
    model = "heuristic";
  }

  // Update lead score in database
  const leadScore = await prisma.leadScore.findUnique({
    where: { leadCaptureId: leadId },
  });

  if (leadScore) {
    await prisma.leadScore.update({
      where: { id: leadScore.id },
      data: {
        visitCount: factors.visitCount,
        engagementMinutes: factors.engagementMinutes,
        formFills: factors.formFills,
        emailOpens: factors.emailOpens,
        linkClicks: factors.linkClicks,
        companySize: factors.companySize ?? null,
        industry: factors.industry ?? null,
        totalScore: score,
        qualificationRating: rating,
        scoringModel: model,
        reasoning,
      },
    });
  }

  await recordAudit({
    category: "SALES",
    action: "lead.scored",
    summary: `Lead ${lead.email} gescoord: ${score} (${rating})`,
    targetType: "leadCapture",
    targetId: leadId,
  });

  return { score, rating, reasoning };
}

/**
 * Calculate risk score (bounce risk, etc.).
 */
export async function calculateRiskScore(leadId: string): Promise<number> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadId },
    include: { leads: true, interactions: true },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  let riskScore = 0;

  // Risk factors
  if (lead.status === "INVALID") riskScore += 100;
  if (lead.status === "OPTED_OUT") riskScore += 80;

  // Engagement risk
  if (lead.visitCount === 0) riskScore += 20;
  if (!lead.firstVisitAt && Date.now() - lead.createdAt.getTime() > 604800000)
    riskScore += 30; // 7 days

  // Company risk
  if (!lead.companySize) riskScore += 10;
  if (!lead.industry) riskScore += 5;

  // Interaction risk
  const hasInteractions = lead.interactions.length > 0;
  if (!hasInteractions && Date.now() - lead.createdAt.getTime() > 86400000)
    riskScore += 15; // 1 day

  // Cap risk score
  riskScore = Math.min(100, riskScore);

  // Update lead score with risk
  if (lead.leads[0]) {
    await prisma.leadScore.update({
      where: { id: lead.leads[0].id },
      data: {
        riskScore,
        bounceRisk: riskScore > 50,
      },
    });
  }

  return riskScore;
}

/**
 * Get leads by qualification rating.
 */
export async function getLeadsByRating(
  rating: QualificationRating,
  limit: number = 50,
) {
  return prisma.leadScore.findMany({
    where: { qualificationRating: rating },
    include: { leadCapture: true },
    orderBy: { totalScore: "desc" },
    take: limit,
  });
}

/**
 * Get hot leads (ready for sales contact).
 */
export async function getHotLeads(limit: number = 20) {
  return getLeadsByRating("HOT", limit);
}

/**
 * Get stalled leads (need re-engagement).
 */
export async function getStalledLeads(limit: number = 50) {
  const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

  return prisma.leadScore.findMany({
    where: {
      leadCapture: {
        lastVisitAt: {
          lt: staleDate,
        },
      },
      qualificationRating: { in: ["MEDIUM", "HIGH"] },
    },
    include: { leadCapture: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
}

/**
 * Bulk score leads (for batch processing).
 */
export async function bulkScoreLeads(leadIds: string[]): Promise<void> {
  for (const leadId of leadIds) {
    try {
      // Get lead data for scoring
      const lead = await prisma.leadCapture.findUnique({
        where: { id: leadId },
        include: {
          leads: true,
          interactions: true,
          sequences: true,
        },
      });

      if (!lead) continue;

      const factors: ScoringFactors = {
        visitCount: lead.visitCount,
        engagementMinutes: lead.interactions.reduce(
          (acc, i) => acc + (i.duration ?? 0),
          0,
        ),
        formFills: lead.interactions.filter((i) => i.type === "form_fill")
          .length,
        emailOpens: lead.sequences.filter((s) => s.status === "opened").length,
        linkClicks: lead.interactions.filter((i) => i.type === "link_click")
          .length,
        companySize: lead.companySize ?? undefined,
        industry: lead.industry ?? undefined,
        kvkNumber: lead.kvkNumber ?? undefined,
      };

      await scoreLead(leadId, factors, false); // Use heuristic for bulk
    } catch (error) {
      logger.warn("Failed to score lead in bulk", { leadId, error });
    }
  }
}
