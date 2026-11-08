import { prisma } from "@/lib/prisma";

export async function applyFreshnessBoost(scores: Map<string, number>, boostFactor = 0.15): Promise<Map<string, number>> {
  const items = await prisma.item.findMany({
    where: { id: { in: Array.from(scores.keys()) } },
    select: { id: true, createdAt: true }
  });

  const now = Date.now();
  const boosted = new Map<string, number>();

  for (const [itemId, score] of scores.entries()) {
    const item = items.find(i => i.id === itemId);
    if (!item) {
      boosted.set(itemId, score);
      continue;
    }

    const ageMs = now - item.createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    let freshBoost = 0;
    if (ageDays < 1) freshBoost = boostFactor * 1.0;
    else if (ageDays < 7) freshBoost = boostFactor * 0.7;
    else if (ageDays < 30) freshBoost = boostFactor * 0.3;

    boosted.set(itemId, Math.min(1, score + freshBoost));
  }

  return boosted;
}

export async function recentTrending(limit = 10): Promise<string[]> {
  const recent = await prisma.item.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    },
    orderBy: { viewCount: "desc" },
    select: { id: true },
    take: limit
  });

  return recent.map(r => r.id);
}
