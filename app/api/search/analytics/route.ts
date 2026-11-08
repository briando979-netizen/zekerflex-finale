import { NextRequest, NextResponse } from "next/server";
import { getSearchAnalytics } from "@/lib/search";
import { requirePrincipal, requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");

    const analytics = await getSearchAnalytics();

    return NextResponse.json({
      analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const status = err instanceof Error ? 403 : 500;
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Analytics fetch failed",
      },
      { status }
    );
  }
}
