import { NextResponse } from "next/server";
import { buildAdminOverview } from "@/lib/admin/overview";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/overview - one aggregated snapshot for the Control Center.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json(await buildAdminOverview());
});
