import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  generateProfitLossStatement,
  generateCashFlowReport,
  generateARAgingReport,
  generateBalanceSheetReport,
} from "@/lib/accounting/reports";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const reportType = request.nextUrl.searchParams.get("type") || "p&l";
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");

    if (!startDate || !endDate) {
      throw AppError.validation("startDate and endDate required");
    }

    let report;

    switch (reportType) {
      case "p&l":
        report = await generateProfitLossStatement(
          principal.tenantId,
          new Date(startDate),
          new Date(endDate)
        );
        break;
      case "cash-flow":
        report = await generateCashFlowReport(
          principal.tenantId,
          new Date(startDate),
          new Date(endDate)
        );
        break;
      case "ar-aging":
        report = await generateARAgingReport(principal.tenantId);
        break;
      case "balance-sheet":
        report = await generateBalanceSheetReport(principal.tenantId, new Date(endDate));
        break;
      default:
        throw AppError.validation("Invalid report type");
    }

    return NextResponse.json({ report });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
