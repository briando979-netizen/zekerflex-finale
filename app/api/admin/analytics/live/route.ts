import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { liveTraffic } from "@/lib/analytics/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/analytics/live - real-time traffic snapshot (PLATFORM_ADMIN).
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    return NextResponse.json(await liveTraffic());
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
