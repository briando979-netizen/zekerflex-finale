import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import * as payroll from "@/lib/payroll/calculator";
import { toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireRole("HQ_ADMIN");
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) throw new Error("tenantId required");

    const body = await request.json();
    const { startDate, endDate } = body;

    const result = await payroll.runPayroll(tenantId, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
