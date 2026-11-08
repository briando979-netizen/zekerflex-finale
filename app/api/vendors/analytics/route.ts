import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getVendorAnalytics, getSpendAnalytics, getComplianceReport, getRiskReport } from "@/lib/vendors";
import { toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PROCUREMENT_MANAGER");
    const type = request.nextUrl.searchParams.get("type") || "overview";
    const vendorId = request.nextUrl.searchParams.get("vendorId");

    let result;
    if (type === "vendor" && vendorId) {
      result = await getVendorAnalytics(vendorId);
    } else if (type === "spend") {
      result = await getSpendAnalytics();
    } else if (type === "compliance") {
      result = await getComplianceReport();
    } else if (type === "risk") {
      result = await getRiskReport();
    } else {
      result = await getSpendAnalytics();
    }

    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
