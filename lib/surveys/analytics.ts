import { prisma } from "@/lib/prisma";

export async function getSurveyAnalytics(surveyId: string) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { responses: true, questions: true },
  });

  if (!survey) throw new Error("Survey not found");

  const totalResponses = survey.responses.length;
  const completedResponses = survey.responses.filter((r) => r.completedAt).length;
  const completionRate =
    totalResponses > 0 ? Math.round((completedResponses / totalResponses) * 100) : 0;

  // Analytics per question
  const questionAnalytics = await Promise.all(
    survey.questions.map(async (question) => {
      const answers = await prisma.surveyAnswer.findMany({
        where: { questionId: question.id },
      });

      const stats: Record<string, number> = {};
      answers.forEach((a) => {
        stats[a.value] = (stats[a.value] || 0) + 1;
      });

      return {
        questionId: question.id,
        title: question.title,
        type: question.type,
        responseCount: answers.length,
        stats,
      };
    })
  );

  // Sentiment distribution
  const sentimentDistribution = {
    positive: survey.responses.filter((r) => r.sentiment === "positive").length,
    neutral: survey.responses.filter((r) => r.sentiment === "neutral").length,
    negative: survey.responses.filter((r) => r.sentiment === "negative").length,
  };

  // Average NPS
  const npsScores = survey.responses
    .filter((r) => r.npsScore !== null)
    .map((r) => r.npsScore!);
  const avgNps =
    npsScores.length > 0
      ? Math.round((npsScores.reduce((a, b) => a + b, 0) / npsScores.length) * 10) / 10
      : 0;

  return {
    surveyId,
    totalResponses,
    completedResponses,
    completionRate,
    averageNps: avgNps,
    sentimentDistribution,
    questionAnalytics,
  };
}

export async function compareSegments(
  surveyId: string,
  segment1Key: string,
  segment2Key: string
) {
  const responses = await prisma.surveyResponse.findMany({
    where: { surveyId },
    include: { answers: true },
  });

  // Simple segmentation by NPS score
  const segment1 = responses.filter((r) => r.npsScore && r.npsScore >= 7);
  const segment2 = responses.filter((r) => r.npsScore && r.npsScore < 7);

  return {
    segment1: {
      count: segment1.length,
      avgSentiment: segment1.filter((r) => r.sentiment === "positive").length / segment1.length || 0,
    },
    segment2: {
      count: segment2.length,
      avgSentiment: segment2.filter((r) => r.sentiment === "positive").length / segment2.length || 0,
    },
  };
}

export async function getTrendAnalysis(surveyId: string, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const responses = await prisma.surveyResponse.findMany({
    where: {
      surveyId,
      completedAt: { gte: startDate },
    },
    orderBy: { completedAt: "asc" },
  });

  // Group by day
  const dailyStats: Record<string, { count: number; sentiment: Record<string, number> }> = {};

  responses.forEach((r) => {
    const day = r.completedAt ? r.completedAt.toISOString().split("T")[0] : "unknown";
    if (!dailyStats[day]) {
      dailyStats[day] = {
        count: 0,
        sentiment: { positive: 0, neutral: 0, negative: 0 },
      };
    }
    dailyStats[day].count += 1;
    if (r.sentiment) {
      dailyStats[day].sentiment[r.sentiment] += 1;
    }
  });

  return Object.entries(dailyStats).map(([date, stats]) => ({
    date,
    ...stats,
  }));
}

export async function getCorrelationAnalysis(
  surveyId: string,
  question1Id: string,
  question2Id: string
) {
  const responses = await prisma.surveyResponse.findMany({
    where: { surveyId },
    include: { answers: true },
  });

  // Find correlation between two questions
  const correlations: Record<string, Record<string, number>> = {};

  responses.forEach((response) => {
    const answer1 = response.answers.find((a) => a.questionId === question1Id);
    const answer2 = response.answers.find((a) => a.questionId === question2Id);

    if (answer1 && answer2) {
      if (!correlations[answer1.value]) {
        correlations[answer1.value] = {};
      }
      correlations[answer1.value][answer2.value] =
        (correlations[answer1.value][answer2.value] || 0) + 1;
    }
  });

  return correlations;
}
