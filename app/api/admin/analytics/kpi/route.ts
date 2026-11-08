import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { KPITracker } from "@/lib/admin/analytics/kpi-tracker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");

    const metric = request.nextUrl.searchParams.get("metric");
    const days = parseInt(request.nextUrl.searchParams.get("days") || "7");

    const kpiTracker = new KPITracker();

    if (metric === "hourly") {
      const metricType = (request.nextUrl.searchParams.get("type") || "revenue") as
        | "revenue"
        | "payouts"
        | "applications";
      const hourlyData = await kpiTracker.getHourlyData(metricType);

      return NextResponse.json({
        metric: metricType,
        data: hourlyData,
        timestamp: new Date().toISOString(),
      });
    }

    // Get real-time KPIs
    const kpis = await kpiTracker.getRealTimeKPIs();

    // Get trends if requested
    if (metric) {
      const metricType = metric as "activeShifts" | "revenue" | "payouts" | "applications";
      const trend = await kpiTracker.getKPITrend(metricType, days);

      return NextResponse.json({
        metric,
        kpis,
        trend,
        timestamp: new Date().toISOString(),
      });
    }

    // Default: all KPIs
    return NextResponse.json({
      kpis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("KPI fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch KPIs" }, { status: 500 });
  }
}
