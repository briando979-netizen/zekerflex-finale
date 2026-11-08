import { prisma } from "@/lib/prisma";

export interface MatchScore {
  freelancerId: string;
  score: number;
  factors: {
    skillMatch: number;
    distanceMatch: number;
    availabilityMatch: number;
    ratingMatch: number;
  };
}

export async function scoreShiftMatch(shiftId: string, freelancerId: string): Promise<number> {
  const [shift, freelancer, reviews] = await Promise.all([
    prisma.shift.findUnique({
      where: { id: shiftId },
      include: { company: true },
    }),
    prisma.freelancerProfile.findUnique({
      where: { id: freelancerId },
      include: { skills: true },
    }),
    prisma.shiftReview.findMany({
      where: { shiftAssignment: { freelancerId } },
    }),
  ]);

  if (!shift || !freelancer) {
    return 0;
  }

  let score = 0;

  // Skill matching (0-30 points)
  const requiredSkills = shift.requiredSkills as string[] | null;
  if (requiredSkills && requiredSkills.length > 0 && freelancer.skills) {
    const freelancerSkills = freelancer.skills.map((s) => s.naam.toLowerCase());
    const matchedSkills = requiredSkills.filter((s) => freelancerSkills.includes(s.toLowerCase()));
    score += (matchedSkills.length / requiredSkills.length) * 30;
  } else {
    score += 30;
  }

  // Distance matching (0-25 points)
  if (freelancer.latitude && freelancer.longitude && shift.latitude && shift.longitude) {
    const distance = calculateDistance(
      freelancer.latitude,
      freelancer.longitude,
      shift.latitude as number,
      shift.longitude as number,
    );
    score += Math.max(0, 25 - distance / 2);
  }

  // Availability match (0-25 points)
  const worksOnDays = freelancer.worksOnDays as string[] | null;
  if (worksOnDays) {
    const shiftDay = new Date(shift.startsAt).toLocaleDateString("en-US", { weekday: "long" });
    if (worksOnDays.includes(shiftDay)) {
      score += 25;
    }
  } else {
    score += 25;
  }

  // Rating match (0-20 points)
  if (reviews.length > 0) {
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    score += (avgRating / 5) * 20;
  } else {
    score += 15;
  }

  return Math.min(100, Math.max(0, score));
}

export async function findBestMatches(shiftId: string, limit = 10): Promise<MatchScore[]> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
  });

  if (!shift) {
    return [];
  }

  const freelancers = await prisma.freelancerProfile.findMany({
    where: {
      active: true,
      NOT: { assignments: { some: { shiftId } } },
    },
    take: 100,
  });

  const scores = await Promise.all(
    freelancers.map(async (f) => ({
      freelancerId: f.id,
      score: await scoreShiftMatch(shiftId, f.id),
    })),
  );

  return scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      ...s,
      factors: {
        skillMatch: 0,
        distanceMatch: 0,
        availabilityMatch: 0,
        ratingMatch: 0,
      },
    }));
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
