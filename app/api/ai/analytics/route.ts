import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { detectAnomalies, analyzeTrends, forecasting } from "@/lib/ai/engine-index";
import { toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get("metric") || "revenue";
    const action = searchParams.get("action") || "anomalies";

    if (action === "anomalies") {
      const anomalies = await detectAnomalies(metric);
      return NextResponse.json({ anomalies }, { status: 200 });
    }

    if (action === "trends") {
      const trends = await analyzeTrends(metric);
      return NextResponse.json({ trends }, { status: 200 });
    }

    if (action === "forecast") {
      const forecast = await forecasting(metric, 30);
      return NextResponse.json({ forecast }, { status: 200 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
