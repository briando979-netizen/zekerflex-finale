import { prisma } from "@/lib/prisma";

export interface RankedResult {
  id: string;
  title: string;
  score: number;
  relevance: number;
  recency: number;
  popularity: number;
}

export async function rankResults(
  results: any[],
  sortBy: "relevance" | "recency" | "popularity" = "relevance"
): Promise<RankedResult[]> {
  const ranked = results.map((r) => {
    const now = Date.now();
    const ageHours = (now - new Date(r.createdAt).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.exp(-ageHours / 168); // 1 week decay

    const relevance = r.relevanceScore || 0.5;
    const popularity = Math.log(Math.max(r.viewCount || 1, 1)) / 10;

    let score = 0;
    if (sortBy === "relevance") {
      score = relevance * 0.7 + recencyScore * 0.2 + popularity * 0.1;
    } else if (sortBy === "recency") {
      score = recencyScore * 0.7 + relevance * 0.2 + popularity * 0.1;
    } else {
      score = popularity * 0.7 + relevance * 0.2 + recencyScore * 0.1;
    }

    return {
      id: r.id,
      title: r.title,
      score,
      relevance,
      recency: recencyScore,
      popularity,
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

export async function boostFeatured(results: RankedResult[]): Promise<RankedResult[]> {
  return results.map((r) => ({
    ...r,
    score: r.score * 1.5, // 50% boost for featured
  }));
}
