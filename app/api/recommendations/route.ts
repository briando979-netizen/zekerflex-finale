import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { userUserSimilarity, itemItemSimilarity } from "@/lib/recommendations/collaborative-filtering";
import { contentSimilarity } from "@/lib/recommendations/content-based";
import { hybridRanking, adaptiveWeights } from "@/lib/recommendations/hybrid";
import { applyFreshnessBoost, recentTrending } from "@/lib/recommendations/freshness";
import { diversifyRecommendations, avoidEchoChamber } from "@/lib/recommendations/diversity";
import { trackRecommendationView } from "@/lib/recommendations/ab-testing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const algorithm = request.nextUrl.searchParams.get("algorithm") ?? "hybrid";
    const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "10");

    let recommendations: Array<{ itemId: string; score: number }> = [];

    if (algorithm === "collaborative") {
      const similar = await userUserSimilarity(principal.userId);
      recommendations = Array.from(similar.entries()).map(([itemId, score]) => ({ itemId, score }));
    } else if (algorithm === "content") {
      const allItems = await require("@/lib/prisma").prisma.item.findMany({ select: { id: true } });
      const recentItem = allItems[0]?.id;
      if (recentItem) {
        const scores = await contentSimilarity(recentItem, allItems.map(i => i.id));
        recommendations = Array.from(scores.entries()).map(([itemId, score]) => ({ itemId, score }));
      }
    } else {
      const collaborativeScores = await userUserSimilarity(principal.userId);
      const contentScores = new Map<string, number>();
      const hybrid = hybridRanking(collaborativeScores, contentScores);
      recommendations = hybrid.map(r => ({ itemId: r.itemId, score: r.hybridScore }));
    }

    const boosted = await applyFreshnessBoost(new Map(recommendations.map(r => [r.itemId, r.score])));
    recommendations = Array.from(boosted.entries()).map(([itemId, score]) => ({ itemId, score }));

    const diverse = await diversifyRecommendations(recommendations, 3);
    const final = diverse.slice(0, limit);

    for (const rec of final) {
      await trackRecommendationView(principal.userId, rec.itemId, algorithm as any);
    }

    return NextResponse.json({ recommendations: final });
  } catch (err) {
    const { status, body } = require("@/lib/errors").toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
