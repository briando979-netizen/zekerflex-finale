import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getTriage } from "@/lib/admin/triage";
import { getKpis } from "@/lib/admin/kpis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/overview-plus — triage queue + KPI sparklines. Read-only.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const [triage, kpis] = await Promise.all([getTriage(), getKpis()]);
    return NextResponse.json({ triage, kpis });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
