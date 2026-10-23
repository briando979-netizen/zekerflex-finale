import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { allFunnelReports } from "@/lib/analytics/funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/funnel?months=3 — funnel-conversie met drop-off per stap.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const months = Math.min(12, Math.max(1, Number(new URL(request.url).searchParams.get("months")) || 1));
  return NextResponse.json({ months, funnels: await allFunnelReports(months) });
});
