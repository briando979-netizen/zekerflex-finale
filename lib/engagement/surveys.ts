import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Validation schemas
export const createPulseSurveySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(["pulse", "eNPS", "satisfaction", "engagement"]).default("pulse"),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annual"]).optional(),
  targetResponse: z.number().min(0).max(100).optional(),
});

export const answerPulseSurveySchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      value: z.number().min(0).max(10).optional(),
      textValue: z.string().optional(),
    })
  ),
  anonymous: z.boolean().default(true),
  employeeId: z.string().optional(),
});

export type CreatePulseSurveyInput = z.infer<typeof createPulseSurveySchema>;
export type AnswerPulseSurveyInput = z.infer<typeof answerPulseSurveySchema>;

/**
 * Create a new pulse survey with questions.
 */
export async function createPulseSurvey(
  tenantId: string,
  input: CreatePulseSurveyInput,
  questions: Array<{ text: string; type: string; required?: boolean; order: number }>
) {
  const survey = await prisma.pulseSurvey.create({
    data: {
      tenantId,
      title: input.title,
      description: input.description,
      type: input.type,
      frequency: input.frequency,
      targetResponse: input.targetResponse,
      status: "draft",
      questions: {
        create: questions.map((q) => ({
          text: q.text,
          type: q.type,
          required: q.required ?? true,
          order: q.order,
        })),
      },
    },
    include: { questions: true },
  });
  return survey;
}

/**
 * Publish a pulse survey to make it active.
 */
export async function publishPulseSurvey(surveyId: string) {
  return prisma.pulseSurvey.update({
    where: { id: surveyId },
    data: { status: "active", startedAt: new Date() },
  });
}

/**
 * Close a pulse survey.
 */
export async function closePulseSurvey(surveyId: string) {
  return prisma.pulseSurvey.update({
    where: { id: surveyId },
    data: { status: "closed", closedAt: new Date() },
  });
}

/**
 * Submit a pulse survey response.
 */
export async function submitPulseSurveyResponse(
  surveyId: string,
  input: AnswerPulseSurveyInput
) {
  const survey = await prisma.pulseSurvey.findUnique({
    where: { id: surveyId },
    include: { questions: true },
  });

  if (!survey) throw new Error("Survey not found");

  // Analyze sentiment from answers
  let sentiment: string | null = null;
  let enpsScore: number | null = null;

  for (const answer of input.answers) {
    const question = survey.questions.find((q) => q.id === answer.questionId);
    if (question?.type === "nps" && answer.value !== undefined) {
      enpsScore = answer.value;
      if (answer.value >= 9) sentiment = "positive";
      else if (answer.value <= 6) sentiment = "negative";
      else sentiment = "neutral";
    }
  }

  const response = await prisma.pulseSurveyResponse.create({
    data: {
      surveyId,
      employeeId: input.employeeId,
      anonymous: input.anonymous,
      sentiment,
      enpsScore,
      answers: {
        create: input.answers.map((a) => ({
          questionId: a.questionId,
          value: a.value,
          textValue: a.textValue,
        })),
      },
    },
    include: { answers: { include: { question: true } } },
  });

  // Update survey response count
  await updateSurveyStats(surveyId);

  return response;
}

/**
 * Get survey results and sentiment analysis.
 */
export async function getSurveyResults(surveyId: string) {
  const survey = await prisma.pulseSurvey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { include: { answers: true } },
      responses: true,
    },
  });

  if (!survey) throw new Error("Survey not found");

  const totalResponses = survey.responses.length;
  const sentimentCounts = {
    positive: survey.responses.filter((r) => r.sentiment === "positive").length,
    neutral: survey.responses.filter((r) => r.sentiment === "neutral").length,
    negative: survey.responses.filter((r) => r.sentiment === "negative").length,
  };

  const averageEnnps =
    survey.responses
      .filter((r) => r.enpsScore !== null)
      .reduce((sum, r) => sum + (r.enpsScore ?? 0), 0) / Math.max(totalResponses, 1);

  return {
    survey,
    totalResponses,
    responseRate: survey.targetResponse
      ? Math.round((totalResponses / (survey.targetResponse * 100)) * 100)
      : 0,
    sentimentBreakdown: sentimentCounts,
    averageEnps: Math.round(averageEnnps),
    questionResults: survey.questions.map((q) => ({
      question: q.text,
      type: q.type,
      responses: q.answers.length,
      avgValue:
        q.type === "likert" || q.type === "nps"
          ? q.answers.reduce((sum, a) => sum + (a.value ?? 0), 0) / Math.max(q.answers.length, 1)
          : undefined,
    })),
  };
}

/**
 * Update survey response statistics.
 */
async function updateSurveyStats(surveyId: string) {
  const responseCount = await prisma.pulseSurveyResponse.count({
    where: { surveyId },
  });

  await prisma.pulseSurvey.update({
    where: { id: surveyId },
    data: { actualResponse: responseCount },
  });
}

/**
 * Get recommended action items based on survey insights.
 */
export async function generateActionPlanFromSurvey(surveyId: string) {
  const results = await getSurveyResults(surveyId);

  const actions: string[] = [];

  if (results.sentimentBreakdown.negative > results.totalResponses * 0.3) {
    actions.push("Address employee concerns - negative sentiment exceeds 30%");
  }

  if (results.averageEnps < 0) {
    actions.push("Implement detractor retention program");
  } else if (results.averageEnps < 50) {
    actions.push("Improve employee experience to increase NPS");
  }

  const actionPlan = await prisma.engagementActionPlan.create({
    data: {
      surveyId,
      tenantId: results.survey.tenantId,
      area: "employee-engagement",
      actions: actions.map((a) => ({
        action: a,
        status: "open",
        createdAt: new Date(),
      })),
    },
  });

  return actionPlan;
}
