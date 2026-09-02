import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { trafficSummary } from "@/lib/analytics/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/analytics/summary?days=7 (PLATFORM_ADMIN)
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const days = Math.min(
      90,
      Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? "7") || 7),
    );
    return NextResponse.json(await trafficSummary(days));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
