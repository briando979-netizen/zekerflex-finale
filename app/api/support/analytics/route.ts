import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getMetrics } from "@/lib/support/analytics/metrics";
import { toErrorBody, AppError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireRole("SUPPORT_AGENT");
    const daysStr = request.nextUrl.searchParams.get("days") || "30";
    const days = Math.min(parseInt(daysStr), 90);

    const metrics = await getMetrics(principal.tenantId, days);

    return NextResponse.json({ metrics });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
