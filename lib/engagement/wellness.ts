import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const recordWellnessActivitySchema = z.object({
  category: z.enum(["fitness", "mental_health", "nutrition", "sleep", "meditation", "social"]),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  duration: z.number().optional(),
  wellnessScore: z.number().min(1).max(10).optional(),
});

export const createWellnessProgramSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(["gym", "meditation", "counseling", "nutrition", "challenge"]),
  url: z.string().url().optional(),
  provider: z.string().optional(),
  cost: z.number().min(0).optional(),
});

export const createWellnessChallengeSchema = z.object({
  name: z.string().min(1).max(255),
  goal: z.string(),
  description: z.string().optional(),
  startDate: z.date(),
  endDate: z.date(),
});

export type RecordWellnessActivityInput = z.infer<typeof recordWellnessActivitySchema>;
export type CreateWellnessProgramInput = z.infer<typeof createWellnessProgramSchema>;
export type CreateWellnessChallengeInput = z.infer<typeof createWellnessChallengeSchema>;

/**
 * Record a wellness activity for an employee.
 */
export async function recordWellnessActivity(
  tenantId: string,
  employeeId: string,
  input: RecordWellnessActivityInput
) {
  const activity = await prisma.wellnessActivity.create({
    data: {
      tenantId,
      employeeId,
      category: input.category,
      title: input.title,
      description: input.description,
      duration: input.duration,
      wellnessScore: input.wellnessScore,
      recordedAt: new Date(),
    },
  });

  return activity;
}

/**
 * Get employee wellness summary.
 */
export async function getEmployeeWellnessSummary(employeeId: string, daysBack = 30) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const activities = await prisma.wellnessActivity.findMany({
    where: {
      employeeId,
      recordedAt: { gte: since },
    },
  });

  const categoryCounts = activities.reduce(
    (acc, a) => {
      acc[a.category] = (acc[a.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalMinutes = activities.reduce((sum, a) => sum + (a.duration ?? 0), 0);
  const avgWellnessScore =
    activities.filter((a) => a.wellnessScore).length > 0
      ? Math.round(
          activities
            .filter((a) => a.wellnessScore)
            .reduce((sum, a) => sum + (a.wellnessScore ?? 0), 0) /
            activities.filter((a) => a.wellnessScore).length
        )
      : 0;

  return {
    employeeId,
    period: `Last ${daysBack} days`,
    totalActivities: activities.length,
    categoryCounts,
    totalMinutes,
    avgWellnessScore,
    recommendedCategories: getWellnessRecommendations(categoryCounts),
  };
}

/**
 * Get wellness recommendations based on activity history.
 */
function getWellnessRecommendations(categoryCounts: Record<string, number>): string[] {
  const recommendations: string[] = [];

  const minActivitiesPerCategory = 4;

  const categories: Array<{
    key: string;
    label: string;
    recommendation: string;
  }> = [
    { key: "fitness", label: "Fitness", recommendation: "Increase physical activity" },
    { key: "mental_health", label: "Mental Health", recommendation: "Prioritize mental wellness" },
    { key: "nutrition", label: "Nutrition", recommendation: "Focus on healthy eating habits" },
    { key: "sleep", label: "Sleep", recommendation: "Improve sleep quality and duration" },
    { key: "meditation", label: "Meditation", recommendation: "Add mindfulness practice" },
    { key: "social", label: "Social", recommendation: "Increase social connections" },
  ];

  categories.forEach((cat) => {
    if ((categoryCounts[cat.key] ?? 0) < minActivitiesPerCategory) {
      recommendations.push(cat.recommendation);
    }
  });

  return recommendations;
}

/**
 * Create a wellness program.
 */
export async function createWellnessProgram(
  tenantId: string,
  input: CreateWellnessProgramInput
) {
  const program = await prisma.wellnessProgram.create({
    data: {
      tenantId,
      name: input.name,
      description: input.description,
      type: input.type,
      url: input.url,
      provider: input.provider,
      cost: input.cost ? Math.round(input.cost * 100) : undefined, // Convert to cents
      active: true,
    },
  });

  return program;
}

/**
 * Get available wellness programs.
 */
export async function getWellnessPrograms(tenantId: string) {
  return prisma.wellnessProgram.findMany({
    where: { tenantId, active: true },
  });
}

/**
 * Create a wellness challenge.
 */
export async function createWellnessChallenge(
  tenantId: string,
  input: CreateWellnessChallengeInput
) {
  const challenge = await prisma.wellnessChallenge.create({
    data: {
      tenantId,
      name: input.name,
      goal: input.goal,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
    },
  });

  return challenge;
}

/**
 * Add participant to wellness challenge.
 */
export async function joinWellnessChallenge(challengeId: string, employeeId: string) {
  const participant = await prisma.wellnessChallengeParticipant.create({
    data: {
      challengeId,
      employeeId,
      joinedAt: new Date(),
    },
  });

  return participant;
}

/**
 * Update participant progress.
 */
export async function updateChallengeProgress(participantId: string, progress: number) {
  const participant = await prisma.wellnessChallengeParticipant.update({
    where: { id: participantId },
    data: {
      progress,
      completedAt: progress === 100 ? new Date() : null,
    },
  });

  return participant;
}

/**
 * Get wellness challenge leaderboard.
 */
export async function getWellnessChallengeLeaderboard(challengeId: string, limit = 10) {
  const participants = await prisma.wellnessChallengeParticipant.findMany({
    where: { challengeId },
    orderBy: { progress: "desc" },
    take: limit,
  });

  return participants.map((p, idx) => ({
    rank: idx + 1,
    employeeId: p.employeeId,
    progress: p.progress,
    completedAt: p.completedAt,
    joinedAt: p.joinedAt,
  }));
}

/**
 * Get company-wide wellness analytics.
 */
export async function getWellnessAnalytics(tenantId: string) {
  const activities = await prisma.wellnessActivity.findMany({
    where: { tenantId },
  });

  const employees = new Set(activities.map((a) => a.employeeId));

  const categoryBreakdown = activities.reduce(
    (acc, a) => {
      acc[a.category] = (acc[a.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalMinutes = activities.reduce((sum, a) => sum + (a.duration ?? 0), 0);
  const avgWellnessScore =
    activities.filter((a) => a.wellnessScore).length > 0
      ? Math.round(
          activities
            .filter((a) => a.wellnessScore)
            .reduce((sum, a) => sum + (a.wellnessScore ?? 0), 0) /
            activities.filter((a) => a.wellnessScore).length
        )
      : 0;

  const activeParticipants = employees.size;
  const participationRate = activeParticipants > 0 ? activeParticipants : 0;

  return {
    totalActivities: activities.length,
    activeEmployees: activeParticipants,
    participationRate,
    categoryBreakdown,
    totalMinutes,
    avgWellnessScore,
    topCategory: Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none",
  };
}

/**
 * Calculate wellness score for an employee (0-100).
 */
export async function calculateWellnessScore(employeeId: string): Promise<number> {
  let score = 50; // baseline

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const activities = await prisma.wellnessActivity.findMany({
    where: {
      employeeId,
      recordedAt: { gte: thirtyDaysAgo },
    },
  });

  // Activity frequency bonus
  if (activities.length >= 20) score += 20;
  else if (activities.length >= 10) score += 10;
  else if (activities.length > 0) score += 5;

  // Category diversity bonus
  const categories = new Set(activities.map((a) => a.category));
  score += Math.min(categories.size * 5, 20);

  // Wellness score average bonus
  const avgWellnessScore =
    activities.filter((a) => a.wellnessScore).length > 0
      ? activities
          .filter((a) => a.wellnessScore)
          .reduce((sum, a) => sum + (a.wellnessScore ?? 0), 0) /
        activities.filter((a) => a.wellnessScore).length
      : 0;

  score += Math.round((avgWellnessScore / 10) * 15);

  return Math.min(score, 100);
}

/**
 * Get wellness health summary (engagement + wellness).
 */
export async function getHealthSummary(employeeId: string) {
  const wellnessScore = await calculateWellnessScore(employeeId);

  const engagement = await prisma.engagementScore.findFirst({
    where: { employeeId },
    orderBy: { lastUpdated: "desc" },
  });

  return {
    employeeId,
    wellnessScore,
    engagementScore: engagement?.score ?? 0,
    overallHealth: Math.round((wellnessScore + (engagement?.score ?? 0)) / 2),
    status:
      wellnessScore >= 70 && (engagement?.score ?? 0) >= 70
        ? "excellent"
        : wellnessScore >= 50 && (engagement?.score ?? 0) >= 50
          ? "good"
          : "needs-attention",
  };
}
