import { prisma } from "@/lib/prisma";
import { z } from "zod";

const responseSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    value: z.string(),
    numValue: z.number().optional(),
  })),
  email: z.string().email().optional(),
  userId: z.string().optional(),
  anonymous: z.boolean().default(false),
  npsScore: z.number().min(0).max(10).optional(),
});

type ResponseInput = z.infer<typeof responseSchema>;

export async function submitResponse(surveyId: string, data: ResponseInput) {
  const validated = responseSchema.parse(data);

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
  });

  if (!survey) throw new Error("Survey not found");

  // Determine sentiment from NPS score
  let sentiment: string | null = null;
  if (validated.npsScore !== undefined) {
    if (validated.npsScore >= 9) sentiment = "positive";
    else if (validated.npsScore >= 7) sentiment = "neutral";
    else sentiment = "negative";
  }

  const response = await prisma.surveyResponse.create({
    data: {
      surveyId,
      email: validated.email,
      userId: validated.userId,
      anonymous: validated.anonymous,
      npsScore: validated.npsScore,
      sentiment,
      completedAt: new Date(),
      answers: {
        create: validated.answers.map((a) => ({
          questionId: a.questionId,
          value: a.value,
          numValue: a.numValue,
        })),
      },
    },
    include: { answers: true },
  });

  return response;
}

export async function getResponses(surveyId: string, limit = 50, offset = 0) {
  const [responses, total] = await Promise.all([
    prisma.surveyResponse.findMany({
      where: { surveyId },
      include: { answers: true },
      orderBy: { completedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.surveyResponse.count({ where: { surveyId } }),
  ]);

  return { responses, total };
}

export async function getResponseStats(surveyId: string) {
  const responses = await prisma.surveyResponse.findMany({
    where: { surveyId, completedAt: { not: null } },
  });

  const completionRate = responses.length > 0 ? 100 : 0;
  const avgNps = responses
    .filter((r) => r.npsScore !== null)
    .reduce((sum, r) => sum + (r.npsScore || 0), 0) / (responses.length || 1);

  const sentimentCounts = {
    positive: responses.filter((r) => r.sentiment === "positive").length,
    neutral: responses.filter((r) => r.sentiment === "neutral").length,
    negative: responses.filter((r) => r.sentiment === "negative").length,
  };

  return {
    totalResponses: responses.length,
    completionRate,
    avgNps: Math.round(avgNps * 10) / 10,
    sentimentCounts,
  };
}

export async function exportResponses(surveyId: string, format: "csv" | "json") {
  const responses = await prisma.surveyResponse.findMany({
    where: { surveyId },
    include: { answers: true },
  });

  if (format === "json") {
    return JSON.stringify(responses, null, 2);
  }

  // CSV format
  const headers = ["ID", "Email", "NPS Score", "Sentiment", "Completed At"];
  const rows = responses.map((r) => [
    r.id,
    r.email || "anonymous",
    r.npsScore || "",
    r.sentiment || "",
    r.completedAt || "",
  ]);

  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  return csv;
}

export async function archiveResponse(surveyId: string, responseId: string) {
  // Soft delete by moving to archived
  return prisma.surveyResponse.update({
    where: { id: responseId },
    data: { completedAt: null }, // Mark as archived
  });
}
