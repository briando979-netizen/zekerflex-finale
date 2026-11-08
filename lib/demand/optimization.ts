import { prisma } from "@/lib/prisma";

interface ShiftAssignment {
  shiftId: string;
  workerId: string;
  matchScore: number;
  distanceKm: number;
  acceptanceProbability: number;
}

export async function optimizeShiftAssignments(
  tenantId: string,
  shiftId: string,
  topN: number = 10
): Promise<ShiftAssignment[]> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { location: true },
  });

  if (!shift) return [];

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
    include: { profile: true },
  });

  const assignments: ShiftAssignment[] = [];

  for (const worker of workers) {
    const matchScore = await calculateMatchScore(worker.id, shift.id);
    const acceptanceProbability = await predictAcceptanceProbability(worker.id, shift.id);
    const distanceKm = calculateDistance(
      shift.location?.latitude ?? 0,
      shift.location?.longitude ?? 0,
      worker.profile?.homeLatitude ?? 0,
      worker.profile?.homeLongitude ?? 0
    );

    if (matchScore > 0.5) {
      assignments.push({
        shiftId: shift.id,
        workerId: worker.id,
        matchScore,
        distanceKm,
        acceptanceProbability,
      });
    }
  }

  // Sort by match + acceptance probability
  return assignments
    .sort((a, b) => b.matchScore * b.acceptanceProbability - a.matchScore * a.acceptanceProbability)
    .slice(0, topN);
}

async function calculateMatchScore(workerId: string, shiftId: string): Promise<number> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
  });

  const worker = await prisma.freelancerProfile.findUnique({
    where: { id: workerId },
    include: { skills: true },
  });

  if (!shift || !worker) return 0;

  const skillsRequired = shift.requiredSkills as string[];
  const workerSkills = worker.skills.map((s) => s.naam.toLowerCase());
  const skillMatch = skillsRequired.filter((s) => workerSkills.includes(s.toLowerCase())).length / skillsRequired.length;

  const pastQuality = await getPastQualityScore(workerId);

  return Math.min((skillMatch * 0.6 + pastQuality * 0.4), 1.0);
}

async function predictAcceptanceProbability(workerId: string, shiftId: string): Promise<number> {
  const recentAcceptances = await prisma.assignment.count({
    where: {
      freelancerId: workerId,
      status: { in: ["ACCEPTED", "CONFIRMED"] },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  const recentOffers = await prisma.assignment.count({
    where: {
      freelancerId: workerId,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  if (recentOffers === 0) return 0.7;

  return Math.min(recentAcceptances / recentOffers, 1.0);
}

async function getPastQualityScore(workerId: string): Promise<number> {
  const reviews = await prisma.review.findMany({
    where: { revieweeId: workerId },
  });

  if (reviews.length === 0) return 0.7;

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return avgRating / 5;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function autoScheduleOptimal(
  tenantId: string,
  shiftId: string
): Promise<{ workerId: string; confidence: number } | null> {
  const assignments = await optimizeShiftAssignments(tenantId, shiftId, 5);

  if (assignments.length === 0) return null;

  const best = assignments[0];
  const confidence = best.matchScore * best.acceptanceProbability;

  if (confidence > 0.75) {
    await prisma.assignment.create({
      data: {
        shiftId: best.shiftId,
        freelancerId: best.workerId,
        status: "SUGGESTED",
      },
    });

    return { workerId: best.workerId, confidence };
  }

  return null;
}
