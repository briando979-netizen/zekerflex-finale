import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const type = request.nextUrl.searchParams.get("type");
    const id = request.nextUrl.searchParams.get("id");
    const days = parseInt(request.nextUrl.searchParams.get("days") || "30");

    if (!type || !id) {
      throw AppError.validation("Type and ID required");
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await prisma.marketingAnalytics.findMany({
      where: {
        [type === "campaign" ? "campaignId" : "dealId"]: id,
        date: { gte: startDate },
      },
      orderBy: { date: "asc" },
    });

    const summary = analytics.reduce(
      (acc, a) => ({
        views: acc.views + a.views,
        clicks: acc.clicks + a.clicks,
        conversions: acc.conversions + a.conversions,
        revenue: acc.revenue + Number(a.revenue),
      }),
      { views: 0, clicks: 0, conversions: 0, revenue: 0 }
    );

    return NextResponse.json({
      analytics,
      summary,
      ctr: summary.views > 0 ? (summary.clicks / summary.views) * 100 : 0,
      conversionRate:
        summary.clicks > 0
          ? (summary.conversions / summary.clicks) * 100
          : 0,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
