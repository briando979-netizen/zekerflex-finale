import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { recordMetrics, getMetricsHistory, getLatestMetrics, getAlerts } from "@/lib/realtime/metrics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");

    const minutes = Number(req.nextUrl.searchParams.get("minutes") ?? 60);
    const includeAlerts = req.nextUrl.searchParams.get("alerts") === "true";

    const history = getMetricsHistory(minutes);
    const latest = getLatestMetrics();
    const alerts = includeAlerts ? getAlerts() : [];

    return NextResponse.json({
      latest,
      history,
      alerts,
      period: `last ${minutes} minutes`,
    });
  } catch (err) {
    console.error("Metrics fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");

    const body = await req.json();
    await recordMetrics(body);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Metrics record error:", err);
    return NextResponse.json({ error: "Failed to record metrics" }, { status: 500 });
  }
}
