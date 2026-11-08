import { prisma } from "@/lib/prisma";

interface ItemFeatures {
  category: string;
  tags: string[];
  price: number;
}

export async function contentSimilarity(itemId: string, candidates: string[]): Promise<Map<string, number>> {
  const baseItem = await prisma.item.findUnique({
    where: { id: itemId },
    select: { category: true, tags: true, price: true }
  });

  if (!baseItem) return new Map();

  const scores = new Map<string, number>();

  for (const candidateId of candidates) {
    const candidate = await prisma.item.findUnique({
      where: { id: candidateId },
      select: { category: true, tags: true, price: true }
    });

    if (!candidate) continue;

    let similarity = 0;

    if (baseItem.category === candidate.category) similarity += 0.4;

    const commonTags = (baseItem.tags ?? []).filter(t => (candidate.tags ?? []).includes(t)).length;
    const totalTags = new Set([...(baseItem.tags ?? []), ...(candidate.tags ?? [])]).size;
    similarity += (commonTags / Math.max(totalTags, 1)) * 0.4;

    const priceDiff = Math.abs(baseItem.price - candidate.price) / Math.max(baseItem.price, candidate.price, 1);
    similarity += Math.max(0, 1 - priceDiff) * 0.2;

    scores.set(candidateId, similarity);
  }

  return scores;
}
