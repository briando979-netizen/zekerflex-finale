import { prisma } from "@/lib/prisma";

export interface Recommendation {
  itemId: string;
  score: number;
  reason: "collaborative" | "content" | "popularity";
  metadata?: Record<string, unknown>;
}

export async function getCollaborativeRecommendations(
  userId: string,
  limit: number = 10,
  minScore: number = 0.3
): Promise<Recommendation[]> {
  const userInteractions = await prisma.userInteraction.findMany({
    where: { userId },
    select: { itemId: true, rating: true },
  });

  if (userInteractions.length === 0) return [];

  const similarUsers = await prisma.userInteraction.groupBy({
    by: ["userId"],
    where: {
      itemId: { in: userInteractions.map((i) => i.itemId) },
      userId: { not: userId },
    },
    _count: { userId: true },
    orderBy: { _count: { userId: "desc" } },
    take: 100,
  });

  const recommendedItems = await prisma.userInteraction.groupBy({
    by: ["itemId"],
    where: {
      userId: { in: similarUsers.map((u) => u.userId) },
      itemId: { notIn: userInteractions.map((i) => i.itemId) },
    },
    _avg: { rating: true },
    _count: { itemId: true },
    orderBy: { _avg: { rating: "desc" } },
    take: limit,
  });

  return recommendedItems
    .filter((item) => (item._avg.rating ?? 0) >= minScore)
    .map((item) => ({
      itemId: item.itemId,
      score: Math.min(1, (item._avg.rating ?? 0) / 5),
      reason: "collaborative" as const,
      metadata: { count: item._count.itemId },
    }));
}

export async function getContentBasedRecommendations(
  itemId: string,
  limit: number = 10
): Promise<Recommendation[]> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { category: true, tags: true },
  });

  if (!item) return [];

  const similarItems = await prisma.item.findMany({
    where: {
      AND: [
        { id: { not: itemId } },
        {
          OR: [{ category: item.category }, { tags: { hasSome: item.tags } }],
        },
      ],
    },
    select: { id: true, category: true, tags: true, popularity: true },
    take: limit,
  });

  return similarItems.map((similar) => ({
    itemId: similar.id,
    score: similar.popularity || 0.5,
    reason: "content" as const,
    metadata: { category: similar.category },
  }));
}

export async function getHybridRecommendations(
  userId: string,
  limit: number = 10
): Promise<Recommendation[]> {
  const collaborative = await getCollaborativeRecommendations(userId, limit / 2);
  const recentItems = await prisma.userInteraction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { itemId: true },
  });

  const contentBased: Recommendation[] = [];
  for (const { itemId } of recentItems) {
    const content = await getContentBasedRecommendations(itemId, 2);
    contentBased.push(...content);
  }

  const combined = [...collaborative, ...contentBased];
  const deduplicated = Array.from(
    new Map(combined.map((r) => [r.itemId, r])).values()
  );

  return deduplicated.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function trackRecommendationClick(
  userId: string,
  itemId: string,
  source: string
): Promise<void> {
  await prisma.recommendationClick.create({
    data: { userId, itemId, source, clickedAt: new Date() },
  });
}

export async function getRecommendationMetrics(): Promise<{
  ctr: number;
  avgScore: number;
  topSources: Record<string, number>;
}> {
  const clicks = await prisma.recommendationClick.findMany();
  const recommendations = await prisma.recommendation.findMany();

  const ctr = clicks.length / Math.max(recommendations.length, 1);
  const avgScore = recommendations.length
    ? recommendations.reduce((sum, r) => sum + (r.score || 0), 0) /
      recommendations.length
    : 0;
  const topSources = clicks.reduce(
    (acc, c) => {
      acc[c.source] = (acc[c.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return { ctr, avgScore, topSources };
}
