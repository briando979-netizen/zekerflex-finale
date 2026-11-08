import { prisma } from "@/lib/prisma";

export interface ABTestResult {
  algorithmId: string;
  clicks: number;
  conversions: number;
  ctr: number;
  conversionRate: number;
  winner: boolean;
}

export async function trackRecommendationView(userId: string, itemId: string, algorithm: "collaborative" | "content" | "hybrid") {
  await prisma.recommendationEvent.create({
    data: {
      userId,
      itemId,
      algorithm,
      type: "view",
      timestamp: new Date()
    }
  });
}

export async function trackRecommendationClick(userId: string, itemId: string, algorithm: string) {
  await prisma.recommendationEvent.create({
    data: {
      userId,
      itemId,
      algorithm,
      type: "click",
      timestamp: new Date()
    }
  });
}

export async function getABTestResults(): Promise<ABTestResult[]> {
  const algorithms = ["collaborative", "content", "hybrid"];
  const results: ABTestResult[] = [];

  for (const algo of algorithms) {
    const views = await prisma.recommendationEvent.count({
      where: { algorithm: algo, type: "view" }
    });

    const clicks = await prisma.recommendationEvent.count({
      where: { algorithm: algo, type: "click" }
    });

    const conversions = await prisma.recommendationEvent.count({
      where: { algorithm: algo, type: "conversion" }
    });

    results.push({
      algorithmId: algo,
      clicks,
      conversions,
      ctr: views > 0 ? clicks / views : 0,
      conversionRate: clicks > 0 ? conversions / clicks : 0,
      winner: false
    });
  }

  const best = results.reduce((a, b) => (a.conversionRate > b.conversionRate ? a : b));
  best.winner = true;

  return results;
}
