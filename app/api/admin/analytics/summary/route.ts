import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { trafficSummary } from "@/lib/analytics/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/analytics/summary?days=7 (PLATFORM_ADMIN)
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? "7") || 7));
  return NextResponse.json(await trafficSummary(days));
});
