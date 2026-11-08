import { prisma } from "@/lib/prisma";

/**
 * Compute overall engagement score for an employee or company.
 */
export async function computeEngagementScore(
  tenantId: string,
  employeeId?: string,
  category = "overall"
) {
  // Factors influencing engagement score (0-100)
  let score = 50; // baseline

  if (employeeId) {
    // Individual engagement score
    const feedback = await prisma.feedbackSession.findMany({
      where: { tenantId, recipientId: employeeId },
      orderBy: { completedAt: "desc" },
      take: 10,
    });

    const surveys = await prisma.pulseSurveyResponse.findMany({
      where: { response: { survey: { tenantId } }, employeeId },
      orderBy: { completedAt: "desc" },
      take: 5,
    });

    const recognitions = await prisma.recognition.findMany({
      where: { tenantId, recipientId: employeeId },
    });

    // Positive feedback indicator
    const positiveFeedback = feedback.filter(
      (f) => f.sentiment === "positive"
    ).length;
    score += positiveFeedback * 5;

    // Survey sentiment
    const positiveSentiments = surveys.filter(
      (s) => s.sentiment === "positive"
    ).length;
    score += positiveSentiments * 3;

    // Recognition count
    score += Math.min(recognitions.length * 2, 30);

    // Goal progress
    const goals = await prisma.employeeGoalProgress.findMany({
      where: { tenantId, employeeId },
    });

    const avgProgress =
      goals.length > 0
        ? goals.reduce((sum, g) => sum + g.currentProgress, 0) / goals.length
        : 0;
    score += (avgProgress / 100) * 20;

    // Cap score at 100
    score = Math.min(score, 100);
  } else {
    // Company-level engagement
    const allScores = await prisma.engagementScore.findMany({
      where: { tenantId, employeeId: null, category },
    });

    if (allScores.length > 0) {
      score = allScores[0].score;
    }
  }

  // Store score
  const engagementScore = await prisma.engagementScore.upsert({
    where: {
      tenantId_employeeId_category: { tenantId, employeeId: employeeId ?? null, category },
    },
    create: {
      tenantId,
      employeeId,
      category,
      score: Math.round(score),
    },
    update: {
      score: Math.round(score),
      lastUpdated: new Date(),
    },
  });

  return engagementScore;
}

/**
 * Predict attrition risk based on engagement signals.
 */
export async function predictAttritionRisk(tenantId: string, employeeId: string) {
  let riskScore = 0;
  const riskFactors: string[] = [];

  // Low engagement score
  const engagement = await computeEngagementScore(tenantId, employeeId);
  if (engagement.score < 40) {
    riskScore += 20;
    riskFactors.push("Low engagement score");
  }

  // Declining satisfaction
  const recentSurveys = await prisma.pulseSurveyResponse.findMany({
    where: { response: { survey: { tenantId } }, employeeId },
    orderBy: { completedAt: "desc" },
    take: 5,
  });

  const hasNegativeTrend = recentSurveys.some((s) => s.sentiment === "negative");
  if (hasNegativeTrend && recentSurveys.length > 1) {
    riskScore += 15;
    riskFactors.push("Declining satisfaction in recent surveys");
  }

  // No recent positive feedback
  const recentFeedback = await prisma.feedbackSession.findMany({
    where: { tenantId, recipientId: employeeId, type: "1on1" },
    orderBy: { completedAt: "desc" },
    take: 3,
  });

  const daysSinceLastFeedback = recentFeedback[0]
    ? Math.floor(
        (Date.now() - (recentFeedback[0].completedAt?.getTime() ?? 0)) / (1000 * 60 * 60 * 24)
      )
    : 365;

  if (daysSinceLastFeedback > 90) {
    riskScore += 10;
    riskFactors.push("No recent 1-on-1 feedback");
  }

  // Goal stagnation
  const stagnantGoals = await prisma.employeeGoalProgress.findMany({
    where: {
      tenantId,
      employeeId,
      status: "active",
      lastUpdated: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 days
    },
  });

  if (stagnantGoals.length > 0) {
    riskScore += 5;
    riskFactors.push("Stagnant goal progress");
  }

  // Low recognition
  const recognitionCount = await prisma.recognition.count({
    where: { recipientId: employeeId },
  });

  if (recognitionCount === 0) {
    riskScore += 10;
    riskFactors.push("No peer recognition");
  }

  // Store risk assessment
  const attritionRisk = await prisma.attritionRisk.create({
    data: {
      tenantId,
      employeeId,
      riskScore: Math.min(riskScore, 100),
      riskFactors: riskFactors,
      recommendations: generateRecommendations(riskScore, riskFactors),
    },
  });

  return attritionRisk;
}

/**
 * Generate retention recommendations based on risk factors.
 */
function generateRecommendations(riskScore: number, riskFactors: string[]): string {
  const recommendations: string[] = [];

  if (riskScore >= 60) {
    recommendations.push("Schedule urgent manager 1-on-1");
  }

  if (riskFactors.includes("Low engagement score")) {
    recommendations.push("Review job fit and growth opportunities");
  }

  if (riskFactors.includes("Declining satisfaction in recent surveys")) {
    recommendations.push("Conduct retention conversation");
  }

  if (riskFactors.includes("No recent 1-on-1 feedback")) {
    recommendations.push("Resume regular 1-on-1 meetings");
  }

  if (riskFactors.includes("Stagnant goal progress")) {
    recommendations.push("Reassess and adjust employee goals");
  }

  if (riskFactors.includes("No peer recognition")) {
    recommendations.push("Encourage team to recognize contributions");
  }

  return recommendations.join("; ");
}

/**
 * Assess company culture across dimensions.
 */
export async function conductCultureAssessment(
  tenantId: string,
  questions: Array<{
    dimension: "collaboration" | "innovation" | "integrity" | "inclusivity" | "accountability";
    prompt: string;
  }>
) {
  const assessment = await prisma.cultureAssessment.create({
    data: {
      tenantId,
      title: "Company Culture Assessment",
      description: "Quarterly culture assessment",
    },
  });

  return assessment;
}

/**
 * Get company-level engagement analytics.
 */
export async function getCompanyEngagementAnalytics(tenantId: string) {
  const employees = await prisma.engagementScore.groupBy({
    by: ["employeeId"],
    where: { tenantId },
    _avg: { score: true },
  });

  const surveys = await prisma.pulseSurveyResponse.groupBy({
    by: ["sentiment"],
    where: { response: { survey: { tenantId } } },
    _count: true,
  });

  const recognitions = await prisma.recognition.groupBy({
    by: ["category"],
    where: { tenantId },
    _count: true,
    _sum: { points: true },
  });

  const avgEngagementScore =
    employees.length > 0
      ? Math.round(employees.reduce((sum, e) => sum + (e._avg.score ?? 0), 0) / employees.length)
      : 0;

  return {
    avgEngagementScore,
    totalEmployeesTracked: employees.length,
    sentimentBreakdown: surveys.reduce(
      (acc, s) => {
        acc[s.sentiment || "unknown"] = s._count;
        return acc;
      },
      {} as Record<string, number>
    ),
    recognitionStats: recognitions.map((r) => ({
      category: r.category,
      count: r._count,
      totalPoints: r._sum.points,
    })),
  };
}

/**
 * Get retention analytics.
 */
export async function getRetentionAnalytics(tenantId: string) {
  const attritionRisks = await prisma.attritionRisk.findMany({
    where: { tenantId },
    orderBy: { assessedAt: "desc" },
    take: 100,
  });

  const highRisk = attritionRisks.filter((r) => r.riskScore >= 60).length;
  const mediumRisk = attritionRisks.filter((r) => r.riskScore >= 40 && r.riskScore < 60).length;
  const lowRisk = attritionRisks.filter((r) => r.riskScore < 40).length;

  const riskFactorFrequency: Record<string, number> = {};
  attritionRisks.forEach((risk) => {
    if (Array.isArray(risk.riskFactors)) {
      risk.riskFactors.forEach((factor: string) => {
        riskFactorFrequency[factor] = (riskFactorFrequency[factor] ?? 0) + 1;
      });
    }
  });

  return {
    totalAssessments: attritionRisks.length,
    riskDistribution: { highRisk, mediumRisk, lowRisk },
    topRiskFactors: Object.entries(riskFactorFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  };
}
