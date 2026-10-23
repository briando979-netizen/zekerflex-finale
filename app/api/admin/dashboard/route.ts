import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { dashboardStats } from "@/lib/admin/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/dashboard — Shopify-stijl KPI's + 30-daagse reeks + activiteitenfeed.
export const GET = withAdminAccess(["PLATFORM_ADMIN", "HQ_ADMIN"], async () => {
  return NextResponse.json(await dashboardStats());
});
