import { prisma } from "@/lib/prisma";

export interface MatchScore {
  workerId: string;
  score: number;
  factors: {
    locationMatch: number;
    skillMatch: number;
    rateMatch: number;
    qualityScore: number;
    availability: number;
  };
}

export async function scoreWorkerMatch(
  shiftId: string,
  workerId: string
): Promise<MatchScore> {
  const [shift, worker] = await Promise.all([
    prisma.shift.findUnique({
      where: { id: shiftId },
      include: { branch: true, requiredSkill: true },
    }),
    prisma.freelancerProfile.findUnique({
      where: { userId: workerId },
      include: {
        skills: true,
        preferredBranches: true,
        shiftAssignments: {
          where: { status: "COMPLETED" },
          take: 1,
        },
      },
    }),
  ]);

  if (!shift || !worker) {
    return { workerId, score: 0, factors: { locationMatch: 0, skillMatch: 0, rateMatch: 0, qualityScore: 0, availability: 0 } };
  }

  // Location match (0-25)
  const locationMatch = worker.preferredBranches.some((b) => b.branchId === shift.branchId)
    ? 25
    : 10;

  // Skill match (0-25)
  let skillMatch = 20;
  if (shift.requiredSkill && worker.skills.some((s) => s.id === shift.requiredSkillId)) {
    skillMatch = 25;
  }

  // Rate match (0-20) - workers prefer higher rates
  const rateMatch = shift.hourlyRateCents >= 2000 ? 20 : 10;

  // Quality score (0-20)
  const qualityScore = worker.shiftAssignments.length > 0 ? 15 : 5;

  // Availability (0-10)
  const availability = 10;

  const totalScore = locationMatch + skillMatch + rateMatch + qualityScore + availability;

  return {
    workerId,
    score: totalScore,
    factors: {
      locationMatch,
      skillMatch,
      rateMatch,
      qualityScore,
      availability,
    },
  };
}

export async function findBestMatches(
  shiftId: string,
  limit: number = 10
): Promise<MatchScore[]> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { branchId: true },
  });

  if (!shift) return [];

  const workers = await prisma.freelancerProfile.findMany({
    where: {
      preferredBranches: { some: { branchId: shift.branchId } },
    },
    select: { userId: true },
    take: limit * 2,
  });

  const scores = await Promise.all(
    workers.map((w) => scoreWorkerMatch(shiftId, w.userId))
  );

  return scores.sort((a, b) => b.score - a.score).slice(0, limit);
}
