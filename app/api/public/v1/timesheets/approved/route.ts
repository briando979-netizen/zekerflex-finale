import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const key = await requireApiKey(request, "timesheets:read");
    const rows = await prisma.timesheet.findMany({
      where: { status: { in: ["APPROVED", "PAID"] }, ...(key.tenantId ? { branch: { tenantId: key.tenantId } } : {}) },
      select: { id: true, scheduledStart: true, scheduledEnd: true, billableMinutes: true, hourlyRateCents: true, status: true, branch: { select: { id: true, name: true, tenantId: true } }, freelancer: { select: { id: true, user: { select: { fullName: true } } } } },
      orderBy: { approvedAt: "desc" }, take: 100,
    });
    return NextResponse.json({ data: rows });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}