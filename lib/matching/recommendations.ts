import { prisma } from "@/lib/prisma";

/**
 * Shift recommendations voor flexwerkers
 * Gebaseerd op: skills, locatie, acceptatie-history, favorites
 */

export async function getShiftRecommendations(
  freelancerId: string,
  limit = 10,
) {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { id: freelancerId },
    include: {
      skills: { select: { skillId: true } },
      assignments: {
        where: { status: "ACCEPTED" },
        select: { shift: { select: { branchId: true } } },
      },
    },
  });

  if (!freelancer) return [];

  const skillIds = freelancer.skills.map((s) => s.skillId);
  const recentBranchIds = [...new Set(freelancer.assignments.map((a) => a.shift.branchId))];

  // Fetch recommended shifts
  const recommendations = await prisma.shift.findMany({
    where: {
      status: "OPEN",
      startsAt: { gte: new Date() },
      OR: [
        // Shifts match freelancer's skills
        skillIds.length > 0 ? { requiredSkillId: { in: skillIds } } : { requiredSkillId: null },
        // Shifts from branches freelancer worked at before
        recentBranchIds.length > 0 ? { branchId: { in: recentBranchIds } } : {},
      ],
    },
    include: {
      branch: { select: { name: true, latitude: true, longitude: true } },
      requiredSkill: true,
    },
    orderBy: { startsAt: "asc" },
    take: limit,
  });

  return recommendations;
}

/**
 * Personalized matches: shifts that fit freelancer's profile
 */
export async function getPersonalizedMatches(freelancerId: string) {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { id: freelancerId },
    select: {
      homeLatitude: true,
      homeLongitude: true,
      skills: { select: { skill: true } },
      assignments: {
        where: { status: { in: ["ACCEPTED", "COMPLETED"] } },
        select: { shift: { select: { branchId: true, hourlyRateCents: true } } },
      },
      acceptanceScore: true,
      reliabilityScore: true,
    },
  });

  if (!freelancer) return { matches: [], reason: "Profiel niet gevonden" };

  // Calculate worker score (0-1)
  const workerScore = Math.max(freelancer.acceptanceScore, freelancer.reliabilityScore);

  // Find shifts where worker score is good enough
  const matches = await prisma.shift.findMany({
    where: {
      status: "OPEN",
      startsAt: { gte: new Date() },
      minSkillRating: { lte: workerScore },
    },
    include: {
      branch: true,
      requiredSkill: true,
      matches: {
        where: { freelancerId },
        select: { id: true, status: true },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  // Filter out already matched
  const available = matches.filter((s) => s.matches.length === 0);

  return {
    matches: available.slice(0, 10),
    reason: `Je hebt een betrouwbaarheidsscore van ${(workerScore * 100).toFixed(0)}%`,
  };
}

/**
 * Shifts similar to favorited/accepted ones
 */
export async function getSimilarShifts(freelancerId: string, referenceShiftId: string) {
  const reference = await prisma.shift.findUnique({
    where: { id: referenceShiftId },
    select: {
      branchId: true,
      hourlyRateCents: true,
      requiredSkillId: true,
    },
  });

  if (!reference) return [];

  return prisma.shift.findMany({
    where: {
      id: { not: referenceShiftId },
      status: "OPEN",
      branchId: reference.branchId,
      hourlyRateCents: {
        gte: reference.hourlyRateCents - 500, // within €5
        lte: reference.hourlyRateCents + 500,
      },
      requiredSkillId: reference.requiredSkillId,
    },
    orderBy: { startsAt: "asc" },
    take: 5,
  });
}
