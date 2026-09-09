import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { liveTraffic } from "@/lib/analytics/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/analytics/live - real-time traffic snapshot (PLATFORM_ADMIN).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json(await liveTraffic());
});
