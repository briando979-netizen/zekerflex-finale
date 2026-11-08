import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const createFeedbackSessionSchema = z.object({
  recipientId: z.string(),
  type: z.enum(["1on1", "peer", "360", "continuous", "annual"]),
  scheduledFor: z.date().optional(),
  content: z.string().optional(),
  strengths: z.string().optional(),
  improvements: z.string().optional(),
  actionItems: z.string().optional(),
});

export const createGoalProgressSchema = z.object({
  employeeId: z.string(),
  goalTitle: z.string().min(1).max(255),
  goalDescription: z.string().optional(),
  targetDate: z.date(),
  keyResults: z.array(z.object({ title: z.string(), metric: z.string() })).optional(),
  milestones: z.array(z.object({ date: z.date(), target: z.number() })).optional(),
});

export type CreateFeedbackSessionInput = z.infer<typeof createFeedbackSessionSchema>;
export type CreateGoalProgressInput = z.infer<typeof createGoalProgressSchema>;

/**
 * Create a feedback session.
 */
export async function createFeedbackSession(
  tenantId: string,
  giverId: string,
  input: CreateFeedbackSessionInput
) {
  let sentiment: string | null = null;

  if (input.content) {
    // Simple sentiment analysis
    const positive =
      (input.content.match(
        /excellent|great|amazing|outstanding|superb|fantastic|perfect|wonderful/gi
      ) || []).length > 0;
    const negative =
      (input.content.match(/poor|weak|needs improvement|concerning|disappointing|problematic/gi) ||
        []).length > 0;

    if (positive && !negative) sentiment = "positive";
    else if (negative && !positive) sentiment = "negative";
    else if (positive && negative) sentiment = "mixed";
    else sentiment = "neutral";
  }

  const session = await prisma.feedbackSession.create({
    data: {
      tenantId,
      giverId,
      recipientId: input.recipientId,
      type: input.type,
      scheduledFor: input.scheduledFor,
      content: input.content,
      strengths: input.strengths,
      improvements: input.improvements,
      actionItems: input.actionItems,
      sentiment,
    },
  });

  return session;
}

/**
 * Complete a feedback session.
 */
export async function completeFeedbackSession(sessionId: string) {
  const session = await prisma.feedbackSession.update({
    where: { id: sessionId },
    data: { completedAt: new Date() },
  });

  return session;
}

/**
 * Get feedback sessions for an employee.
 */
export async function getEmployeeFeedback(employeeId: string, limit = 50) {
  return prisma.feedbackSession.findMany({
    where: { recipientId: employeeId },
    orderBy: { completedAt: "desc" },
    take: limit,
  });
}

/**
 * Get 1-on-1 meeting schedule.
 */
export async function getOneOnOneSchedule(managerId: string) {
  const scheduledSessions = await prisma.feedbackSession.findMany({
    where: {
      giverId: managerId,
      type: "1on1",
      scheduledFor: { not: null, gte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
  });

  return scheduledSessions;
}

/**
 * Create employee goal with progress tracking.
 */
export async function createEmployeeGoal(
  tenantId: string,
  input: CreateGoalProgressInput
) {
  const goal = await prisma.employeeGoalProgress.create({
    data: {
      tenantId,
      employeeId: input.employeeId,
      goalTitle: input.goalTitle,
      goalDescription: input.goalDescription,
      targetDate: input.targetDate,
      status: "active",
      currentProgress: 0,
      keyResults: input.keyResults ? JSON.stringify(input.keyResults) : undefined,
      milestones: input.milestones ? JSON.stringify(input.milestones) : undefined,
    },
  });

  return goal;
}

/**
 * Update goal progress.
 */
export async function updateGoalProgress(
  goalId: string,
  progress: number,
  notes?: string
) {
  const goal = await prisma.employeeGoalProgress.update({
    where: { id: goalId },
    data: {
      currentProgress: Math.min(progress, 100),
      status: progress === 100 ? "completed" : progress > 0 ? "active" : "active",
      lastUpdated: new Date(),
    },
  });

  return goal;
}

/**
 * Get employee goals.
 */
export async function getEmployeeGoals(employeeId: string, status?: "active" | "completed") {
  return prisma.employeeGoalProgress.findMany({
    where: {
      employeeId,
      ...(status && { status }),
    },
    orderBy: { targetDate: "asc" },
  });
}

/**
 * Create 1-on-1 template.
 */
export async function createOneOnOneTemplate(
  tenantId: string,
  name: string,
  topics: string[],
  structure: any
) {
  return prisma.oneOnOneTemplate.create({
    data: {
      tenantId,
      name,
      topics,
      template: structure,
    },
  });
}

/**
 * Get 1-on-1 templates.
 */
export async function getOneOnOneTemplates(tenantId: string) {
  return prisma.oneOnOneTemplate.findMany({
    where: { tenantId },
  });
}

/**
 * Generate performance insights for an employee.
 */
export async function generatePerformanceInsights(employeeId: string, tenantId: string) {
  const insights: Array<{
    category: string;
    insight: string;
    metric?: number;
    benchmark?: number;
    trend?: string;
    recommendation?: string;
  }> = [];

  // Feedback sentiment analysis
  const feedback = await prisma.feedbackSession.findMany({
    where: { recipientId: employeeId, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take: 10,
  });

  const positiveFeedback = feedback.filter((f) => f.sentiment === "positive").length;
  const negativeFeedback = feedback.filter((f) => f.sentiment === "negative").length;

  if (feedback.length > 0) {
    insights.push({
      category: "quality",
      insight: `Feedback trend: ${positiveFeedback > negativeFeedback ? "Positive" : "Mixed"} across recent sessions`,
      metric: positiveFeedback,
      benchmark: feedback.length,
      trend: positiveFeedback > negativeFeedback ? "up" : negativeFeedback > 0 ? "down" : "stable",
      recommendation:
        positiveFeedback < feedback.length / 2
          ? "Focus on areas of improvement from feedback"
          : "Maintain current performance level",
    });
  }

  // Goal achievement rate
  const allGoals = await prisma.employeeGoalProgress.findMany({
    where: { employeeId },
  });

  const completedGoals = allGoals.filter((g) => g.status === "completed").length;
  const completionRate = allGoals.length > 0 ? (completedGoals / allGoals.length) * 100 : 0;

  insights.push({
    category: "growth",
    insight: `Goal completion rate: ${Math.round(completionRate)}%`,
    metric: completedGoals,
    benchmark: allGoals.length,
    trend: completionRate >= 75 ? "up" : completionRate >= 50 ? "stable" : "down",
    recommendation: completionRate < 50 ? "Set more achievable goals and track progress regularly" : "Continue setting challenging goals",
  });

  // Engagement trend
  const engagement = await prisma.engagementScore.findFirst({
    where: { employeeId },
    orderBy: { lastUpdated: "desc" },
  });

  if (engagement) {
    insights.push({
      category: "retention_risk",
      insight: `Engagement score: ${engagement.score}`,
      metric: engagement.score,
      benchmark: 75,
      trend: engagement.score >= 75 ? "up" : engagement.score >= 50 ? "stable" : "down",
      recommendation: engagement.score < 50 ? "Schedule conversation about role fit and satisfaction" : "Continue current engagement initiatives",
    });
  }

  // Store insights
  for (const insight of insights) {
    await prisma.performanceInsight.create({
      data: {
        tenantId,
        employeeId,
        category: insight.category,
        insight: insight.insight,
        metric: insight.metric,
        benchmark: insight.benchmark,
        trend: insight.trend,
        recommendation: insight.recommendation,
      },
    });
  }

  return insights;
}

/**
 * Get performance insights for an employee.
 */
export async function getPerformanceInsights(employeeId: string) {
  return prisma.performanceInsight.findMany({
    where: { employeeId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Create feedback report summary.
 */
export async function generateFeedbackReport(
  employeeId: string,
  periodDays = 90
): Promise<{
  employeeId: string;
  period: string;
  feedbackCount: number;
  sentimentDistribution: Record<string, number>;
  averageSentiment: string;
  keyStrengths: string[];
  keyImprovementAreas: string[];
  actionItems: string[];
  recommendations: string[];
}> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const feedback = await prisma.feedbackSession.findMany({
    where: {
      recipientId: employeeId,
      completedAt: { gte: since },
    },
  });

  const sentimentDistribution: Record<string, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    mixed: 0,
  };

  feedback.forEach((f) => {
    if (f.sentiment) sentimentDistribution[f.sentiment] = (sentimentDistribution[f.sentiment] ?? 0) + 1;
  });

  const keyStrengths: string[] = [];
  const keyImprovementAreas: string[] = [];
  const actionItems: string[] = [];

  feedback.forEach((f) => {
    if (f.strengths) {
      const strengths = f.strengths.split(",").map((s) => s.trim());
      keyStrengths.push(...strengths);
    }
    if (f.improvements) {
      const improvements = f.improvements.split(",").map((i) => i.trim());
      keyImprovementAreas.push(...improvements);
    }
    if (f.actionItems) {
      const items = f.actionItems.split(",").map((i) => i.trim());
      actionItems.push(...items);
    }
  });

  const uniqueStrengths = Array.from(new Set(keyStrengths)).slice(0, 5);
  const uniqueImprovements = Array.from(new Set(keyImprovementAreas)).slice(0, 5);
  const uniqueActionItems = Array.from(new Set(actionItems)).slice(0, 5);

  const positiveCount = sentimentDistribution.positive || 0;
  const negativeCount = sentimentDistribution.negative || 0;
  const averageSentiment =
    positiveCount > negativeCount
      ? "positive"
      : negativeCount > positiveCount
        ? "negative"
        : "neutral";

  return {
    employeeId,
    period: `${periodDays} days`,
    feedbackCount: feedback.length,
    sentimentDistribution,
    averageSentiment,
    keyStrengths: uniqueStrengths,
    keyImprovementAreas: uniqueImprovements,
    actionItems: uniqueActionItems,
    recommendations: uniqueImprovements.length > 0
      ? uniqueImprovements.map((area) => `Focus on improving: ${area}`)
      : ["Continue current performance level"],
  };
}
