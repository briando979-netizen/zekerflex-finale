import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import * as reporting from "@/lib/hr/reporting";
import { toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("HQ_ADMIN");
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const reportType = request.nextUrl.searchParams.get("type");

    if (!tenantId) throw new Error("tenantId required");

    let result;
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    switch (reportType) {
      case "metrics":
        result = await reporting.getHRMetrics(tenantId, startOfYear, now);
        break;
      case "compensation":
        result = await reporting.getCompensationReport(tenantId);
        break;
      case "leave":
        result = await reporting.getLeaveAnalysis(tenantId);
        break;
      case "compliance":
        result = await reporting.generateComplianceReport(tenantId);
        break;
      default:
        result = await reporting.getHRMetrics(tenantId, startOfYear, now);
    }

    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
