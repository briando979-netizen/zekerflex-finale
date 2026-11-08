export interface RecommendationScore {
  itemId: string;
  collaborativeScore: number;
  contentScore: number;
  hybridScore: number;
}

export function hybridRanking(
  collaborative: Map<string, number>,
  content: Map<string, number>,
  weights = { collaborative: 0.5, content: 0.5 }
): RecommendationScore[] {
  const allItems = new Set([...collaborative.keys(), ...content.keys()]);
  const scores: RecommendationScore[] = [];

  for (const itemId of allItems) {
    const collaborativeScore = collaborative.get(itemId) ?? 0;
    const contentScore = content.get(itemId) ?? 0;

    const hybridScore =
      (collaborativeScore * weights.collaborative) +
      (contentScore * weights.content);

    scores.push({
      itemId,
      collaborativeScore: Math.min(1, collaborativeScore),
      contentScore: Math.min(1, contentScore),
      hybridScore: Math.min(1, hybridScore)
    });
  }

  return scores.sort((a, b) => b.hybridScore - a.hybridScore);
}

export function adaptiveWeights(userEngagement: number): { collaborative: number; content: number } {
  if (userEngagement > 0.7) return { collaborative: 0.7, content: 0.3 };
  if (userEngagement > 0.4) return { collaborative: 0.5, content: 0.5 };
  return { collaborative: 0.3, content: 0.7 };
}
