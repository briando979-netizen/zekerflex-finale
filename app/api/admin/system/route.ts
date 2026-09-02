import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { runStartupChecks } from "@/lib/config/startup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/system - full sovereign startup report (PLATFORM_ADMIN).
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const report = await runStartupChecks();
    return NextResponse.json(report, { status: report.ok ? 200 : 503 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
