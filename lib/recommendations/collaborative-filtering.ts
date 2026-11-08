import { prisma } from "@/lib/prisma";

export async function userUserSimilarity(userId: string): Promise<Map<string, number>> {
  const userRatings = await prisma.rating.findMany({
    where: { userId },
    select: { itemId: true, score: true }
  });

  const userPairs = new Map<string, number>();

  for (const { itemId, score } of userRatings) {
    const similarUsers = await prisma.rating.findMany({
      where: { itemId, userId: { not: userId } },
      select: { userId: true, score: true }
    });

    for (const { userId: otherUserId, score: otherScore } of similarUsers) {
      const similarity = 1 - Math.abs(score - otherScore) / 5;
      userPairs.set(otherUserId, (userPairs.get(otherUserId) ?? 0) + similarity);
    }
  }

  return userPairs;
}

export async function itemItemSimilarity(itemId: string): Promise<Map<string, number>> {
  const itemRatings = await prisma.rating.findMany({
    where: { itemId },
    select: { userId: true, score: true }
  });

  const userIds = itemRatings.map(r => r.userId);
  const similarItems = new Map<string, number>();

  const otherRatings = await prisma.rating.findMany({
    where: { userId: { in: userIds }, itemId: { not: itemId } },
    select: { itemId: true, score: true }
  });

  for (const { itemId: otherId, score } of otherRatings) {
    const overlap = itemRatings.filter(r => r.score > 3).length;
    const similarity = overlap / Math.max(itemRatings.length, 1);
    similarItems.set(otherId, (similarItems.get(otherId) ?? 0) + similarity);
  }

  return similarItems;
}
