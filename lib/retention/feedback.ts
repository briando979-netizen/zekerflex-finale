import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { CustomerFeedback } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Subsystem 4: NPS & Feedback
//
// Net Promoter Score tracking, sentiment analysis, feedback collection,
// and action item management for customer satisfaction measurement.
// ---------------------------------------------------------------------------

export const FeedbackSchema = z.object({
  customerId: z.string(),
  feedbackType: z.enum(["nps", "satisfaction", "feature_request", "bug_report"]),
  npsScore: z.number().int().min(0).max(10).optional(),
  message: z.string().min(5).max(2000),
  category: z.string().optional(),
  source: z.enum(["email", "in_app", "webhook"]).default("in_app"),
});

export type FeedbackInput = z.infer<typeof FeedbackSchema>;

const SENTIMENT_KEYWORDS = {
  positive: ["great", "excellent", "love", "awesome", "perfect", "amazing", "wonderful", "fantastic"],
  negative: ["bad", "terrible", "hate", "awful", "poor", "useless", "broken", "frustrating"],
};

/**
 * Analyze sentiment from text.
 */
export function analyzeSentiment(text: string): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();

  const posCount = SENTIMENT_KEYWORDS.positive.filter((keyword) => lower.includes(keyword)).length;
  const negCount = SENTIMENT_KEYWORDS.negative.filter((keyword) => lower.includes(keyword)).length;

  if (posCount > negCount) return "positive";
  if (negCount > posCount) return "negative";
  return "neutral";
}

/**
 * Categorize NPS score.
 */
export function categorizeNPS(score: number): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

/**
 * Submit customer feedback.
 */
export async function submitFeedback(input: FeedbackInput): Promise<CustomerFeedback> {
  try {
    const validated = FeedbackSchema.parse(input);

    const sentiment = analyzeSentiment(validated.message);
    const npsCategory = validated.npsScore ? categorizeNPS(validated.npsScore) : null;

    const feedback = await prisma.customerFeedback.create({
      data: {
        customerId: validated.customerId,
        feedbackType: validated.feedbackType,
        npsScore: validated.npsScore ?? null,
        npsCategory,
        sentiment,
        message: validated.message,
        category: validated.category ?? null,
        source: validated.source,
      },
    });

    logger.info("Feedback submitted", {
      customerId: validated.customerId,
      type: validated.feedbackType,
      sentiment,
      npsScore: validated.npsScore,
    });

    // Alert on detractors
    if (validated.feedbackType === "nps" && npsCategory === "detractor") {
      logger.warn("NPS detractor detected", {
        customerId: validated.customerId,
        score: validated.npsScore,
      });
    }

    return feedback;
  } catch (err) {
    logger.error("Failed to submit feedback", {
      error: (err as Error).message,
    });
    throw AppError.validation("Feedbackverzending mislukt.");
  }
}

/**
 * Get feedback for a customer.
 */
export async function getCustomerFeedback(
  customerId: string,
  limit = 50,
): Promise<CustomerFeedback[]> {
  return prisma.customerFeedback.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Record response to feedback.
 */
export async function respondToFeedback(
  feedbackId: string,
  response: string,
  actionItems?: string[],
): Promise<CustomerFeedback> {
  return prisma.customerFeedback.update({
    where: { id: feedbackId },
    data: {
      responded: true,
      responseDate: new Date(),
      responseNotes: response,
      actionItems: actionItems ?? [],
    },
  });
}

/**
 * Get unresponded feedback.
 */
export async function getUnrespondedFeedback(limit = 50): Promise<CustomerFeedback[]> {
  return prisma.customerFeedback.findMany({
    where: {
      responded: false,
      feedbackType: { in: ["bug_report", "feature_request"] },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Get detractor feedback.
 */
export async function getDetractorFeedback(limit = 30): Promise<CustomerFeedback[]> {
  return prisma.customerFeedback.findMany({
    where: {
      npsCategory: "detractor",
      responded: false,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Calculate NPS for a period.
 */
export async function calculateNPS(startDate?: Date, endDate?: Date): Promise<{
  nps_score: number;
  promoters: number;
  passives: number;
  detractors: number;
  respondent_count: number;
}> {
  const feedback = await prisma.customerFeedback.findMany({
    where: {
      feedbackType: "nps",
      npsScore: { not: null },
      ...(startDate && endDate && {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      }),
    },
  });

  const promoters = feedback.filter((f) => f.npsCategory === "promoter").length;
  const passives = feedback.filter((f) => f.npsCategory === "passive").length;
  const detractors = feedback.filter((f) => f.npsCategory === "detractor").length;

  const total = promoters + passives + detractors;
  const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

  logger.info("NPS calculated", {
    score: npsScore,
    total,
    promoters,
    detractors,
  });

  return {
    nps_score: npsScore,
    promoters,
    passives,
    detractors,
    respondent_count: total,
  };
}

/**
 * Get feedback sentiment distribution.
 */
export async function getFeedbackSentiment(): Promise<{
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  positive_percentage: number;
  negative_percentage: number;
}> {
  const feedback = await prisma.customerFeedback.findMany({
    where: {
      sentiment: { not: null },
    },
  });

  const positive = feedback.filter((f) => f.sentiment === "positive").length;
  const neutral = feedback.filter((f) => f.sentiment === "neutral").length;
  const negative = feedback.filter((f) => f.sentiment === "negative").length;

  const total = feedback.length;

  return {
    positive_count: positive,
    neutral_count: neutral,
    negative_count: negative,
    positive_percentage: total > 0 ? Math.round((positive / total) * 100) : 0,
    negative_percentage: total > 0 ? Math.round((negative / total) * 100) : 0,
  };
}

/**
 * Get top feature requests.
 */
export async function getTopFeatureRequests(limit = 10): Promise<
  Array<{
    category: string;
    count: number;
    feedback_samples: string[];
  }>
> {
  const feedback = await prisma.customerFeedback.findMany({
    where: {
      feedbackType: "feature_request",
      category: { not: null },
    },
  });

  const grouped: Record<string, string[]> = {};

  for (const item of feedback) {
    if (item.category) {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item.message);
    }
  }

  return Object.entries(grouped)
    .map(([category, messages]) => ({
      category,
      count: messages.length,
      feedback_samples: messages.slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Generate feedback report.
 */
export async function generateFeedbackReport(): Promise<{
  total_feedback: number;
  by_type: Record<string, number>;
  avg_nps: number;
  sentiment_distribution: Record<string, number>;
  response_rate: number;
  unresponded_count: number;
}> {
  const allFeedback = await prisma.customerFeedback.findMany();

  const byType: Record<string, number> = {
    nps: 0,
    satisfaction: 0,
    feature_request: 0,
    bug_report: 0,
  };

  const sentimentDist: Record<string, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };

  let totalNPS = 0;
  let npsCount = 0;

  for (const feedback of allFeedback) {
    byType[feedback.feedbackType] = (byType[feedback.feedbackType] ?? 0) + 1;

    if (feedback.sentiment) {
      sentimentDist[feedback.sentiment] = (sentimentDist[feedback.sentiment] ?? 0) + 1;
    }

    if (feedback.npsScore !== null) {
      totalNPS += feedback.npsScore;
      npsCount += 1;
    }
  }

  const responded = allFeedback.filter((f) => f.responded).length;
  const responseRate = allFeedback.length > 0 ? Math.round((responded / allFeedback.length) * 100) : 0;

  logger.info("Feedback report generated", {
    total: allFeedback.length,
    avgNps: npsCount > 0 ? Math.round(totalNPS / npsCount) : 0,
    responseRate,
  });

  return {
    total_feedback: allFeedback.length,
    by_type: byType,
    avg_nps: npsCount > 0 ? Math.round(totalNPS / npsCount) : 0,
    sentiment_distribution: sentimentDist,
    response_rate: responseRate,
    unresponded_count: allFeedback.length - responded,
  };
}
