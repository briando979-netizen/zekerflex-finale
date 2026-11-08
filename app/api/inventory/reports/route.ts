import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  getStockValuation,
  getTurnoverReport,
  getAgingReport,
  getWasteReport,
  getSupplierAnalysis,
  getCostAnalysis,
  generateReport,
} from "@/lib/inventory/reporting";
import { calculateForecast, listForecasts, getStockOutAlerts } from "@/lib/inventory/forecasting";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    let data;

    switch (type) {
      case "valuation":
        data = await getStockValuation(principal.tenantId);
        break;
      case "turnover":
        data = await getTurnoverReport(principal.tenantId);
        break;
      case "aging":
        data = await getAgingReport(principal.tenantId);
        break;
      case "waste":
        data = await getWasteReport(principal.tenantId);
        break;
      case "supplier":
        data = await getSupplierAnalysis(principal.tenantId);
        break;
      case "cost":
        data = await getCostAnalysis(principal.tenantId);
        break;
      case "forecasts":
        data = await listForecasts(principal.tenantId);
        break;
      case "stockout-alerts":
        data = await getStockOutAlerts(principal.tenantId);
        break;
      default:
        throw AppError.validation("Unknown report type");
    }

    return NextResponse.json({ report: data });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { type, productId } = await request.json();

    if (productId && type === "forecast") {
      const forecast = await calculateForecast(principal.tenantId, productId);
      return NextResponse.json({ forecast }, { status: 201 });
    }

    const report = await generateReport(principal.tenantId, type);

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
