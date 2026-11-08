import { prisma } from "@/lib/prisma";

interface WorkerAvailabilityForecast {
  workerId: string;
  date: Date;
  predictedAvailable: boolean;
  availabilityScore: number;
  factors: { pastAcceptance: number; skillMatch: number; distanceScore: number };
}

export async function forecastWorkerAvailability(
  tenantId: string,
  date: Date,
  requiredSkills: string[]
): Promise<WorkerAvailabilityForecast[]> {
  const workers = await prisma.freelancerProfile.findMany({
    where: {
      user: {
        tenants: {
          some: {
            tenantId,
            role: "FREELANCER",
          },
        },
      },
    },
    include: {
      skills: true,
      userId: true,
    },
  });

  const forecasts: WorkerAvailabilityForecast[] = [];

  for (const worker of workers) {
    const acceptanceRate = await getAcceptanceRate(worker.id);
    const skillMatch = calculateSkillMatch(worker.skills.map((s) => s.naam), requiredSkills);
    const isAvailable = acceptanceRate > 0.6 && skillMatch > 0.5;

    forecasts.push({
      workerId: worker.id,
      date,
      predictedAvailable: isAvailable,
      availabilityScore: (acceptanceRate + skillMatch) / 2,
      factors: {
        pastAcceptance: acceptanceRate,
        skillMatch,
        distanceScore: 0.8,
      },
    });
  }

  return forecasts.sort((a, b) => b.availabilityScore - a.availabilityScore);
}

async function getAcceptanceRate(freelancerId: string): Promise<number> {
  const total = await prisma.assignment.count({
    where: { freelancerId },
  });

  if (total === 0) return 0.7; // Default for new workers

  const accepted = await prisma.assignment.count({
    where: {
      freelancerId,
      status: { in: ["ACCEPTED", "COMPLETED", "CONFIRMED"] },
    },
  });

  return Math.min(accepted / total, 1.0);
}

function calculateSkillMatch(workerSkills: string[], requiredSkills: string[]): number {
  if (requiredSkills.length === 0) return 1.0;
  const matches = workerSkills.filter((s) => requiredSkills.includes(s.toLowerCase())).length;
  return matches / requiredSkills.length;
}

export async function predictWorkerRetention(freelancerId: string, days: number = 30): Promise<number> {
  const recentAssignments = await prisma.assignment.findMany({
    where: {
      freelancerId,
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    },
  });

  if (recentAssignments.length === 0) return 0.5;

  const completed = recentAssignments.filter((a) => a.status === "COMPLETED").length;
  return completed / recentAssignments.length;
}
