import { prisma } from "@/lib/prisma";
import { z } from "zod";

const feedbackSchema = z.object({
  spaceId: z.string(),
  category: z.enum(["SAFETY", "COMFORT", "CLEANLINESS", "TEMPERATURE", "NOISE", "LIGHTING"]),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
  submittedBy: z.string(),
});

export async function submitWorkplaceFeedback(data: z.infer<typeof feedbackSchema>) {
  const validated = feedbackSchema.parse(data);
  return prisma.workplaceFeedback.create({
    data: { ...validated, createdAt: new Date() },
  });
}

export async function getSafetyMetrics(spaceId: string) {
  const incidents = await prisma.safetyIncident.findMany({
    where: { spaceId },
    orderBy: { reportedAt: "desc" },
  });

  const feedback = await prisma.workplaceFeedback.findMany({
    where: { spaceId, category: "SAFETY" },
  });

  const avgSafetyRating = feedback.length > 0 ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length : 0;

  return { incidentCount: incidents.length, avgSafetyRating, recentIncidents: incidents.slice(0, 10) };
}

export async function getSustainabilityScore(spaceId: string) {
  const feedback = await prisma.workplaceFeedback.findMany({ where: { spaceId } });
  const energyUsage = await prisma.energyConsumption.findFirst({
    where: { spaceId },
    orderBy: { recordedAt: "desc" },
  });

  const feedbackScore = feedback.length ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length : 0;
  const efficiencyScore = energyUsage ? Math.max(0, 100 - (energyUsage.consumption / 100) * 10) : 50;

  return { feedbackScore: feedbackScore * 20, efficiencyScore, totalScore: (feedbackScore * 20 + efficiencyScore) / 2 };
}

export async function reportSafetyIncident(spaceId: string, description: string, severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", reportedBy: string) {
  return prisma.safetyIncident.create({
    data: { spaceId, description, severity, reportedBy, reportedAt: new Date(), resolved: false },
  });
}
