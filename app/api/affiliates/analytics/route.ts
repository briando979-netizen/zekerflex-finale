import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const affiliate = await prisma.affiliate.findUnique({
      where: { userId: principal.userId },
    });

    if (!affiliate) {
      return NextResponse.json({ error: "Not an affiliate" }, { status: 403 });
    }

    const trackings = await prisma.tracking.findMany({
      where: { affiliateId: affiliate.id },
    });

    const conversions = trackings.filter((t) => t.converted);
    const totalValue = conversions.reduce((sum, t) => sum + (t.conversionValue || 0), 0);
    const totalCommission = conversions.reduce((sum, t) => sum + (t.commission || 0), 0);

    // Top sources
    const sourceStats = trackings.reduce(
      (acc, t) => {
        acc[t.utm.source] = (acc[t.utm.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Daily conversions (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentTrackings = trackings.filter((t) => t.firstClick >= thirtyDaysAgo);
    const dailyStats = recentTrackings.reduce(
      (acc, t) => {
        const day = t.firstClick.toISOString().split("T")[0];
        if (!acc[day]) acc[day] = { clicks: 0, conversions: 0 };
        acc[day].clicks++;
        if (t.converted) acc[day].conversions++;
        return acc;
      },
      {} as Record<string, { clicks: number; conversions: number }>
    );

    return NextResponse.json({
      summary: {
        totalClicks: trackings.length,
        totalConversions: conversions.length,
        conversionRate: trackings.length > 0 ? (conversions.length / trackings.length) * 100 : 0,
        totalValue,
        totalCommission,
        pendingCommission: affiliate.totalEarnings - totalCommission,
      },
      tier: affiliate.tier,
      commissionRate: affiliate.commissionRate,
      topSources: Object.entries(sourceStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([source, count]) => ({ source, count })),
      dailyStats: Object.entries(dailyStats)
        .sort((a, b) => (b[0] > a[0] ? 1 : -1))
        .map(([date, stats]) => ({ date, ...stats })),
      lastPayout: affiliate.lastPayoutAt,
    });
  } catch (err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
