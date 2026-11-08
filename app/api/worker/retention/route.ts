import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { calculateEngagementScore } from "@/lib/worker/engagement-scoring";
import { predictChurnRisk } from "@/lib/worker/retention-prediction";
import { calculateWorkerLevel } from "@/lib/worker/progression";
import { getActiveOffersForWorker, sendPersonalizedOffers } from "@/lib/worker/engagement-communication";
import { identifyInactiveWorkers, launchWinBackCampaign, getReengagementMetrics } from "@/lib/worker/reengagement";
import { getReferralBonusForWorker, getLoyaltyRewards } from "@/lib/worker/incentives";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const workerId = request.nextUrl.searchParams.get("workerId");
    const metric = request.nextUrl.searchParams.get("metric");

    if (!workerId) {
      throw new Error("workerId required");
    }

    if (metric === "engagement") {
      const score = await calculateEngagementScore(workerId);
      return NextResponse.json({ engagementScore: score });
    }

    if (metric === "churn") {
      const risk = await predictChurnRisk(workerId);
      return NextResponse.json({ churnRisk: risk });
    }

    if (metric === "level") {
      const level = await calculateWorkerLevel(workerId);
      return NextResponse.json({ workerLevel: level });
    }

    if (metric === "offers") {
      const offers = await getActiveOffersForWorker(workerId);
      return NextResponse.json({ offers });
    }

    if (metric === "loyalty") {
      const rewards = await getLoyaltyRewards(workerId);
      return NextResponse.json({ loyaltyRewards: rewards });
    }

    return NextResponse.json({
      engagementScore: await calculateEngagementScore(workerId),
      churnRisk: await predictChurnRisk(workerId),
      workerLevel: await calculateWorkerLevel(workerId),
      offers: await getActiveOffersForWorker(workerId),
      loyalty: await getLoyaltyRewards(workerId),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const body = await request.json();
    const action = body.action;

    if (action === "personalize-offers") {
      const workerId = body.workerId;
      const offers = await sendPersonalizedOffers(workerId);
      return NextResponse.json({ offers }, { status: 201 });
    }

    if (action === "winback-campaign") {
      const daysSinceLastShift = body.daysSinceLastShift || 30;
      const bonusAmount = body.bonusAmount || 30;

      const inactiveWorkers = await identifyInactiveWorkers(daysSinceLastShift);
      const campaigns = await launchWinBackCampaign(inactiveWorkers, bonusAmount);

      return NextResponse.json({
        campaignsLaunched: campaigns.length,
        campaigns,
      }, { status: 201 });
    }

    if (action === "referral-bonus") {
      const workerId = body.workerId;
      const bonus = await getReferralBonusForWorker(workerId);
      return NextResponse.json({ referralBonus: bonus });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const metrics = await getReengagementMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 400 }
    );
  }
}
