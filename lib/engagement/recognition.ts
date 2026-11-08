import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const createRecognitionSchema = z.object({
  recipientId: z.string(),
  category: z.enum(["general", "excellence", "innovation", "teamwork", "leadership", "values"]),
  message: z.string().min(1).max(500),
  points: z.number().min(0).max(1000).optional().default(10),
  isPublic: z.boolean().default(true),
  isAnonymous: z.boolean().default(false),
  badge: z
    .object({
      name: z.string(),
      icon: z.string().optional(),
      description: z.string().optional(),
      rarityLevel: z.enum(["common", "uncommon", "rare", "epic", "legendary"]),
    })
    .optional(),
});

export type CreateRecognitionInput = z.infer<typeof createRecognitionSchema>;

/**
 * Create a peer recognition.
 */
export async function createRecognition(
  tenantId: string,
  recognizerId: string,
  input: CreateRecognitionInput
) {
  const recognition = await prisma.recognition.create({
    data: {
      tenantId,
      recognizerId,
      recipientId: input.recipientId,
      category: input.category,
      message: input.message,
      points: input.points ?? 10,
      isPublic: input.isPublic,
      isAnonymous: input.isAnonymous,
    },
  });

  // Create badge if provided
  if (input.badge) {
    await prisma.recognitionBadge.create({
      data: {
        recognitionId: recognition.id,
        name: input.badge.name,
        icon: input.badge.icon,
        description: input.badge.description,
        rarityLevel: input.badge.rarityLevel,
      },
    });
  }

  // Update recipient points
  await updateLeaderboardPoints(tenantId, input.recipientId, input.points ?? 10);

  return recognition;
}

/**
 * Get recognition wall - public recognitions.
 */
export async function getRecognitionWall(tenantId: string, limit = 50) {
  return prisma.recognition.findMany({
    where: { tenantId, isPublic: true },
    include: { badge: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Get recognitions for an employee.
 */
export async function getEmployeeRecognitions(employeeId: string, limit = 50) {
  return prisma.recognition.findMany({
    where: { recipientId: employeeId },
    include: { badge: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Get employee total points and badges.
 */
export async function getEmployeeRecognitionStats(employeeId: string) {
  const recognitions = await prisma.recognition.findMany({
    where: { recipientId: employeeId },
    include: { badge: true },
  });

  const totalPoints = recognitions.reduce((sum, r) => sum + r.points, 0);
  const badges = recognitions.map((r) => r.badge).filter(Boolean);
  const uniqueBadges = Array.from(new Set(badges.map((b) => b?.rarityLevel))).length;

  return {
    employeeId,
    totalPoints,
    recognitionsCount: recognitions.length,
    badgesCount: badges.length,
    uniqueBadgeLevels: uniqueBadges,
    recentRecognitions: recognitions.slice(0, 5),
  };
}

/**
 * Update leaderboard points for an employee.
 */
export async function updateLeaderboardPoints(
  tenantId: string,
  employeeId: string,
  pointsToAdd: number
) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let leaderboardEntry = await prisma.recognitionLeaderboard.findFirst({
    where: {
      tenantId,
      employeeId,
      periodStart,
    },
  });

  if (!leaderboardEntry) {
    leaderboardEntry = await prisma.recognitionLeaderboard.create({
      data: {
        tenantId,
        employeeId,
        periodStart,
        totalPoints: pointsToAdd,
        recognitionsCount: 1,
      },
    });
  } else {
    leaderboardEntry = await prisma.recognitionLeaderboard.update({
      where: { id: leaderboardEntry.id },
      data: {
        totalPoints: { increment: pointsToAdd },
        recognitionsCount: { increment: 1 },
      },
    });
  }

  // Recalculate ranks
  await updateLeaderboardRanks(tenantId, periodStart);

  return leaderboardEntry;
}

/**
 * Recalculate leaderboard rankings.
 */
export async function updateLeaderboardRanks(tenantId: string, periodStart: Date) {
  const leaderboard = await prisma.recognitionLeaderboard.findMany({
    where: { tenantId, periodStart },
    orderBy: { totalPoints: "desc" },
  });

  // Update ranks
  for (let i = 0; i < leaderboard.length; i++) {
    await prisma.recognitionLeaderboard.update({
      where: { id: leaderboard[i].id },
      data: { rank: i + 1 },
    });
  }

  return leaderboard.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}

/**
 * Get leaderboard for a period.
 */
export async function getLeaderboard(tenantId: string, limit = 10) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return prisma.recognitionLeaderboard.findMany({
    where: { tenantId, periodStart },
    orderBy: { rank: "asc" },
    take: limit,
  });
}

/**
 * Award milestone badges.
 */
export async function checkAndAwardMilestoneBadges(employeeId: string) {
  const stats = await getEmployeeRecognitionStats(employeeId);
  const badges: Array<{
    name: string;
    icon: string;
    description: string;
    milestone: number;
  }> = [
    { name: "Rising Star", icon: "⭐", description: "10+ recognitions", milestone: 10 },
    { name: "Team Player", icon: "🤝", description: "25+ recognitions", milestone: 25 },
    { name: "Champion", icon: "🏆", description: "50+ recognitions", milestone: 50 },
    { name: "Legend", icon: "👑", description: "100+ recognitions", milestone: 100 },
  ];

  const awardedBadges = [];
  for (const badge of badges) {
    if (stats.recognitionsCount >= badge.milestone) {
      // Check if already awarded
      const existing = await prisma.recognitionBadge.findFirst({
        where: {
          name: badge.name,
          recognition: { recipientId: employeeId },
        },
      });

      if (!existing) {
        // Create milestone recognition
        const recognition = await prisma.recognition.create({
          data: {
            tenantId: "system", // This would be the tenant ID
            recognizerId: "system",
            recipientId: employeeId,
            category: "excellence",
            message: `Milestone achievement: ${badge.description}`,
            points: 50,
            isPublic: true,
            isAnonymous: false,
          },
        });

        await prisma.recognitionBadge.create({
          data: {
            recognitionId: recognition.id,
            name: badge.name,
            icon: badge.icon,
            description: badge.description,
            rarityLevel: "epic",
          },
        });

        awardedBadges.push(badge);
      }
    }
  }

  return awardedBadges;
}
