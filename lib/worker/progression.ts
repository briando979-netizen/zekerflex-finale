import { prisma } from "@/lib/prisma";

export interface WorkerLevel {
  level: number;
  name: string;
  requiredShifts: number;
  requiredRating: number;
  benefits: string[];
}

const LEVELS: WorkerLevel[] = [
  {
    level: 1,
    name: "Starter",
    requiredShifts: 0,
    requiredRating: 0,
    benefits: ["Basic job access"],
  },
  {
    level: 2,
    name: "Regular",
    requiredShifts: 10,
    requiredRating: 4.0,
    benefits: ["Priority shifts", "€10 referral bonus"],
  },
  {
    level: 3,
    name: "Pro",
    requiredShifts: 50,
    requiredRating: 4.5,
    benefits: ["24h early shift access", "€25 referral bonus", "Flexible rates"],
  },
  {
    level: 4,
    name: "Expert",
    requiredShifts: 100,
    requiredRating: 4.7,
    benefits: ["72h early access", "€50 referral bonus", "Premium support"],
  },
  {
    level: 5,
    name: "Master",
    requiredShifts: 250,
    requiredRating: 4.8,
    benefits: ["VIP access", "€100 referral bonus", "1-on-1 manager", "Custom rates"],
  },
];

export async function calculateWorkerLevel(workerId: string): Promise<number> {
  const shifts = await prisma.shift.count({
    where: { assignedWorkerId: workerId, completedAt: { not: null } },
  });

  const reviews = await prisma.freelancerReview.findMany({
    where: { freelancerId: workerId },
  });

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
      : 0;

  let level = 1;
  for (const lvl of LEVELS) {
    if (shifts >= lvl.requiredShifts && avgRating >= lvl.requiredRating) {
      level = lvl.level;
    } else {
      break;
    }
  }

  await prisma.workerLevel.upsert({
    where: { workerId },
    update: { level, updatedAt: new Date() },
    create: { workerId, level },
  });

  return level;
}

export async function unlockAchievement(
  workerId: string,
  achievementType: string
) {
  const existing = await prisma.workerAchievement.findFirst({
    where: { workerId, type: achievementType },
  });

  if (existing) return existing;

  return prisma.workerAchievement.create({
    data: {
      workerId,
      type: achievementType,
      unlockedAt: new Date(),
    },
  });
}

export async function getCareerPath(workerId: string) {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: workerId },
  });

  if (!profile) return null;

  const level = await prisma.workerLevel.findUnique({
    where: { workerId },
  });

  const currentLevel = LEVELS.find((l) => l.level === (level?.level || 1));
  const nextLevel = LEVELS.find((l) => l.level === ((level?.level || 1) + 1));

  const shifts = await prisma.shift.count({
    where: { assignedWorkerId: workerId, completedAt: { not: null } },
  });

  const achievements = await prisma.workerAchievement.findMany({
    where: { workerId },
  });

  return {
    currentLevel,
    nextLevel,
    shiftsCompleted: shifts,
    shiftsToNextLevel: nextLevel
      ? Math.max(0, nextLevel.requiredShifts - shifts)
      : 0,
    achievements,
  };
}
