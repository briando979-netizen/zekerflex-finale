import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getAssetAnalytics, getTenantAnalytics, getAssetUsageStats } from "@/lib/dam/analytics";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const assetId = request.nextUrl.searchParams.get("assetId");
    const reportType = request.nextUrl.searchParams.get("type") ?? "tenant";

    if (reportType === "asset" && assetId) {
      const analytics = await getAssetAnalytics(assetId);
      return NextResponse.json(analytics);
    }

    if (reportType === "usage" && assetId) {
      const days = parseInt(request.nextUrl.searchParams.get("days") ?? "30");
      const stats = await getAssetUsageStats(assetId, days);
      return NextResponse.json(stats);
    }

    // Tenant analytics
    const analytics = await getTenantAnalytics(principal.tenantId);
    return NextResponse.json(analytics);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
