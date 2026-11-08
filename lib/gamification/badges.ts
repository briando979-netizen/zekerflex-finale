import { prisma } from "@/lib/prisma";

export const BADGES = {
  first_booking: {
    name: "First Step",
    description: "Complete your first booking",
    icon: "🎯",
    points: 10,
  },
  ten_bookings: {
    name: "Getting Started",
    description: "Complete 10 bookings",
    icon: "🚀",
    points: 50,
  },
  fifty_bookings: {
    name: "Regular",
    description: "Complete 50 bookings",
    icon: "⭐",
    points: 100,
  },
  hundred_bookings: {
    name: "Super Regular",
    description: "Complete 100 bookings",
    icon: "🌟",
    points: 200,
  },
  perfect_rating: {
    name: "Perfectionist",
    description: "Maintain 5-star rating",
    icon: "👑",
    points: 150,
  },
  team_player: {
    name: "Team Player",
    description: "Accepted 5+ shifts in a row",
    icon: "🤝",
    points: 75,
  },
  early_bird: {
    name: "Early Bird",
    description: "Complete morning shifts",
    icon: "🌅",
    points: 50,
  },
  night_owl: {
    name: "Night Owl",
    description: "Complete evening shifts",
    icon: "🌙",
    points: 50,
  },
  helper: {
    name: "Helper",
    description: "Help another worker 3 times",
    icon: "🙌",
    points: 60,
  },
  influencer: {
    name: "Influencer",
    description: "Get 100+ followers",
    icon: "📢",
    points: 100,
  },
};

export async function awardBadge(userId: string, badgeId: string) {
  const badge = BADGES[badgeId as keyof typeof BADGES];

  if (!badge) {
    throw new Error("Badge not found");
  }

  const awarded = await prisma.badge.create({
    data: {
      userId,
      badgeId,
      name: badge.name,
      description: badge.description,
      pointsAwarded: badge.points,
    },
  });

  return awarded;
}

export async function getUserBadges(userId: string) {
  return await prisma.badge.findMany({
    where: { userId },
    orderBy: { awardedAt: "desc" },
  });
}

export async function checkAndAwardBadges(userId: string) {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId },
  });

  if (!freelancer) return;

  const assignments = await prisma.shiftAssignment.count({
    where: { freelancerId: freelancer.id, status: "COMPLETED" },
  });

  if (assignments === 1) {
    await awardBadge(userId, "first_booking").catch(() => {});
  } else if (assignments === 10) {
    await awardBadge(userId, "ten_bookings").catch(() => {});
  } else if (assignments === 50) {
    await awardBadge(userId, "fifty_bookings").catch(() => {});
  } else if (assignments === 100) {
    await awardBadge(userId, "hundred_bookings").catch(() => {});
  }
}
