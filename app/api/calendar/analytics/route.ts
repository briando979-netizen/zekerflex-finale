import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import * as analyticsLib from "@/lib/calendar/analytics";
import { toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get("type") || "overview";

    let result: any = {};

    if (type === "overview" || type === "all") {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      result.analytics = await analyticsLib.getCalendarAnalytics(
        principal.userId,
        startDate,
        endDate
      );
    }

    if (type === "efficiency" || type === "all") {
      result.efficiency = await analyticsLib.getMeetingEfficiency(
        principal.userId
      );
    }

    if (type === "patterns" || type === "all") {
      result.patterns = await analyticsLib.getSchedulingPatterns(
        principal.userId
      );
    }

    if (type === "utilization" || type === "all") {
      result.utilization = await analyticsLib.getResourceUtilization(
        principal.userId
      );
    }

    if (type === "timeUsage" || type === "all") {
      result.timeUsage = await analyticsLib.getTimeUsage(principal.userId);
    }

    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
