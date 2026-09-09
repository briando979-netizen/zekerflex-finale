import { NextResponse } from "next/server";
import { getTriage } from "@/lib/admin/triage";
import { getKpis } from "@/lib/admin/kpis";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/overview-plus — triage queue + KPI sparklines. Read-only.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [triage, kpis] = await Promise.all([getTriage(), getKpis()]);
  return NextResponse.json({ triage, kpis });
});
