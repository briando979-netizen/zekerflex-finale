import { prisma } from "@/lib/prisma";
import { z } from "zod";

const surveySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["nps", "feedback", "custom"]),
  questions: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(["text", "multiple_choice", "rating", "nps", "likert"]),
    required: z.boolean().default(true),
    options: z.array(z.string()).optional(),
    order: z.number(),
  })),
});

type SurveyInput = z.infer<typeof surveySchema>;

export async function createSurvey(tenantId: string, data: SurveyInput) {
  const validated = surveySchema.parse(data);

  const survey = await prisma.survey.create({
    data: {
      tenantId,
      title: validated.title,
      description: validated.description,
      type: validated.type,
      status: "draft",
      questions: {
        create: validated.questions.map((q) => ({
          title: q.title,
          description: q.description,
          type: q.type,
          required: q.required,
          options: q.options || [],
          order: q.order,
        })),
      },
    },
    include: { questions: true },
  });

  return survey;
}

export async function updateSurvey(
  tenantId: string,
  surveyId: string,
  data: Partial<SurveyInput>
) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
  });

  if (!survey || survey.tenantId !== tenantId) {
    throw new Error("Survey not found");
  }

  return prisma.survey.update({
    where: { id: surveyId },
    data: {
      title: data.title,
      description: data.description,
      type: data.type,
    },
    include: { questions: true },
  });
}

export async function publishSurvey(tenantId: string, surveyId: string) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
  });

  if (!survey || survey.tenantId !== tenantId) {
    throw new Error("Survey not found");
  }

  return prisma.survey.update({
    where: { id: surveyId },
    data: {
      status: "active",
      startDate: new Date(),
    },
  });
}

export async function closeSurvey(tenantId: string, surveyId: string) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
  });

  if (!survey || survey.tenantId !== tenantId) {
    throw new Error("Survey not found");
  }

  return prisma.survey.update({
    where: { id: surveyId },
    data: {
      status: "closed",
      endDate: new Date(),
    },
  });
}

export async function getSurvey(tenantId: string, surveyId: string) {
  return prisma.survey.findFirst({
    where: { id: surveyId, tenantId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
}

export async function getSurveysByTenant(tenantId: string) {
  return prisma.survey.findMany({
    where: { tenantId },
    include: { questions: true, _count: { select: { responses: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function cloneSurvey(tenantId: string, surveyId: string) {
  const survey = await getSurvey(tenantId, surveyId);
  if (!survey) throw new Error("Survey not found");

  const cloned = await prisma.survey.create({
    data: {
      tenantId,
      title: `${survey.title} (Copy)`,
      description: survey.description,
      type: survey.type,
      status: "draft",
      questions: {
        create: survey.questions.map((q) => ({
          title: q.title,
          description: q.description,
          type: q.type,
          required: q.required,
          options: q.options,
          order: q.order,
        })),
      },
    },
    include: { questions: true },
  });

  return cloned;
}
