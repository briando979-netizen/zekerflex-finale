import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/v1/timesheets/approved — approved/paid timesheets for the
// calling organization. Authenticate with `Authorization: Bearer zf_live_...`
// (see /admin/integraties). Requires the "timesheets:read" scope.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "timesheets:read");
    const rows = await prisma.timesheet.findMany({
      where: { status: { in: ["APPROVED", "PAID"] }, ...(key.tenantId ? { branch: { tenantId: key.tenantId } } : {}) },
      select: { id: true, scheduledStart: true, scheduledEnd: true, billableMinutes: true, hourlyRateCents: true, status: true, branch: { select: { id: true, name: true, tenantId: true } }, freelancer: { select: { id: true, user: { select: { fullName: true } } } } },
      orderBy: { approvedAt: "desc" }, take: 100,
    });
    return NextResponse.json({ data: rows }, { headers: rateLimitHeaders(rate) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}