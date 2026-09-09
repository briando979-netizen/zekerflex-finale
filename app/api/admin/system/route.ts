import { NextResponse } from "next/server";
import { runStartupChecks } from "@/lib/config/startup";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/system - full sovereign startup report (PLATFORM_ADMIN).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const report = await runStartupChecks();
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
});
