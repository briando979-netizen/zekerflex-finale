import { prisma } from "@/lib/prisma";

export interface DiverseRecommendation {
  itemId: string;
  category: string;
  score: number;
}

export async function diversifyRecommendations(
  rankedItems: Array<{ itemId: string; score: number }>,
  maxPerCategory = 3
): Promise<DiverseRecommendation[]> {
  const items = await prisma.item.findMany({
    where: { id: { in: rankedItems.map(r => r.itemId) } },
    select: { id: true, category: true }
  });

  const categoryMap = new Map(items.map(i => [i.id, i.category]));
  const categoryCount = new Map<string, number>();
  const diverse: DiverseRecommendation[] = [];

  for (const { itemId, score } of rankedItems) {
    const category = categoryMap.get(itemId);
    if (!category) continue;

    const count = categoryCount.get(category) ?? 0;
    if (count < maxPerCategory) {
      diverse.push({ itemId, category, score });
      categoryCount.set(category, count + 1);
    }
  }

  return diverse;
}

export async function avoidEchoChamber(
  userItems: string[],
  candidates: Array<{ itemId: string; score: number }>,
  noveltyWeight = 0.2
): Promise<Array<{ itemId: string; score: number }>> {
  const candidateSet = new Set(userItems);

  const adjusted = candidates.map(({ itemId, score }) => {
    const isNovel = !candidateSet.has(itemId) ? 1 : 0.5;
    return {
      itemId,
      score: score * (1 - noveltyWeight) + isNovel * noveltyWeight
    };
  });

  return adjusted.sort((a, b) => b.score - a.score);
}
