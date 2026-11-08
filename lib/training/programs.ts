import { prisma } from "@/lib/prisma";
import { z } from "zod";

const trainingProgramSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  durationHours: z.number().positive(),
  targetSkills: z.array(z.string()),
  modules: z.array(z.object({
    name: z.string(),
    order: z.number(),
    durationMinutes: z.number(),
    hasQuiz: z.boolean().default(false),
    quizPassScore: z.number().min(0).max(100).optional(),
  })),
});

export async function createProgram(data: z.infer<typeof trainingProgramSchema>) {
  const validated = trainingProgramSchema.parse(data);
  return prisma.trainingProgram.create({
    data: {
      name: validated.name,
      description: validated.description,
      durationHours: validated.durationHours,
      targetSkills: JSON.stringify(validated.targetSkills),
      modules: {
        create: validated.modules,
      },
    },
    include: { modules: true },
  });
}

export async function enrollUser(userId: string, programId: string) {
  return prisma.userEnrollment.create({
    data: { userId, programId, enrolledAt: new Date() },
    include: { program: { include: { modules: true } } },
  });
}

export async function completeModule(enrollmentId: string, moduleId: string, quizScore?: number) {
  return prisma.moduleCompletion.create({
    data: {
      enrollmentId,
      moduleId,
      completedAt: new Date(),
      quizScore,
    },
  });
}

export async function getEnrollmentProgress(enrollmentId: string) {
  const enrollment = await prisma.userEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      program: { include: { modules: true } },
      completions: true,
    },
  });

  if (!enrollment) return null;

  const completed = enrollment.completions.length;
  const total = enrollment.program.modules.length;
  const progress = (completed / total) * 100;

  return { enrollment, completed, total, progress };
}
