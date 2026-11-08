import { prisma } from "@/lib/prisma";
import { z } from "zod";

const npsSchema = z.object({
  score: z.number().min(0).max(10),
  email: z.string().email().optional(),
  userId: z.string().optional(),
  comment: z.string().optional(),
});

type NpsInput = z.infer<typeof npsSchema>;

export function getSegment(score: number): string {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export async function submitNps(tenantId: string, data: NpsInput) {
  const validated = npsSchema.parse(data);

  const nps = await prisma.npsTracking.create({
    data: {
      tenantId,
      score: validated.score,
      segment: getSegment(validated.score),
      email: validated.email,
      userId: validated.userId,
      comment: validated.comment,
      followUp: "pending",
    },
  });

  return nps;
}

export async function getNpsStats(tenantId: string) {
  const responses = await prisma.npsTracking.findMany({
    where: { tenantId },
  });

  if (responses.length === 0) {
    return {
      npsScore: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      responseCount: 0,
    };
  }

  const promoters = responses.filter((r) => r.segment === "promoter").length;
  const detractors = responses.filter((r) => r.segment === "detractor").length;

  const npsScore =
    ((promoters - detractors) / responses.length) * 100;

  return {
    npsScore: Math.round(npsScore),
    promoters,
    passives: responses.filter((r) => r.segment === "passive").length,
    detractors,
    responseCount: responses.length,
  };
}

export async function getNpsTrend(tenantId: string, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const responses = await prisma.npsTracking.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by day
  const dailyStats: Record<string, { promoters: number; detractors: number }> =
    {};

  responses.forEach((r) => {
    const day = r.createdAt.toISOString().split("T")[0];
    if (!dailyStats[day]) {
      dailyStats[day] = { promoters: 0, detractors: 0 };
    }
    if (r.segment === "promoter") dailyStats[day].promoters += 1;
    if (r.segment === "detractor") dailyStats[day].detractors += 1;
  });

  return Object.entries(dailyStats).map(([date, stats]) => ({
    date,
    npsScore:
      ((stats.promoters - stats.detractors) / (stats.promoters + stats.detractors)) * 100 || 0,
  }));
}

export async function getDetractorComments(tenantId: string, limit = 10) {
  return prisma.npsTracking.findMany({
    where: {
      tenantId,
      segment: "detractor",
      comment: { not: null },
    },
    select: { comment: true, email: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function updateFollowUpStatus(
  tenantId: string,
  npsId: string,
  status: string
) {
  return prisma.npsTracking.update({
    where: { id: npsId },
    data: { followUp: status },
  });
}

export async function createFollowUpWorkflow(tenantId: string, npsId: string) {
  const nps = await prisma.npsTracking.findUnique({
    where: { id: npsId },
  });

  if (!nps || nps.tenantId !== tenantId) {
    throw new Error("NPS not found");
  }

  // Create workflow task
  if (nps.segment === "detractor" && nps.email) {
    // Send follow-up email to detractors
    return prisma.npsTracking.update({
      where: { id: npsId },
      data: { followUp: "follow_up_scheduled" },
    });
  }

  if (nps.segment === "promoter" && nps.email) {
    // Ask promoters for referral
    return prisma.npsTracking.update({
      where: { id: npsId },
      data: { followUp: "referral_requested" },
    });
  }

  return nps;
}
