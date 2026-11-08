import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as analytics from "@/lib/events/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const eventId = request.nextUrl.searchParams.get("eventId");
    const metric = request.nextUrl.searchParams.get("metric") || "all";

    if (!eventId) {
      throw AppError.validation("eventId required");
    }

    let result = {};

    if (metric === "all" || metric === "attendance") {
      result = { ...result, attendance: await analytics.getAttendanceMetrics(eventId) };
    }

    if (metric === "all" || metric === "revenue") {
      result = { ...result, revenue: await analytics.getRevenueMetrics(eventId) };
    }

    if (metric === "all" || metric === "roi") {
      result = { ...result, roi: await analytics.getMarketingROI(eventId) };
    }

    if (metric === "all" || metric === "demographics") {
      result = { ...result, demographics: await analytics.getAttendeeDemographics(eventId) };
    }

    if (metric === "all" || metric === "engagement") {
      result = { ...result, engagement: await analytics.getEngagementMetrics(eventId) };
    }

    if (metric === "all" || metric === "insights") {
      result = { ...result, insights: await analytics.getPlanningInsights(principal.userId) };
    }

    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
