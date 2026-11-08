import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import * as crmReporting from "@/lib/crm/reporting";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get("type") || "dashboard";

    if (type === "forecast") {
      const forecast = await crmReporting.getSalesForecast(
        principal.tenantId
      );
      return NextResponse.json({ forecast });
    }

    if (type === "winloss") {
      const analysis = await crmReporting.getWinLossAnalysis(
        principal.tenantId
      );
      return NextResponse.json({ analysis });
    }

    if (type === "performance") {
      const performance = await crmReporting.getRepPerformance(
        principal.tenantId
      );
      return NextResponse.json({ performance });
    }

    if (type === "funnel") {
      const funnel = await crmReporting.getFunnelMetrics(principal.tenantId);
      return NextResponse.json({ funnel });
    }

    if (type === "conversion") {
      const metrics = await crmReporting.getConversionMetrics(
        principal.tenantId
      );
      return NextResponse.json({ metrics });
    }

    // Dashboard: all metrics
    const [forecast, winloss, funnel, conversion] = await Promise.all([
      crmReporting.getSalesForecast(principal.tenantId),
      crmReporting.getWinLossAnalysis(principal.tenantId),
      crmReporting.getFunnelMetrics(principal.tenantId),
      crmReporting.getConversionMetrics(principal.tenantId),
    ]);

    return NextResponse.json({
      forecast,
      winloss,
      funnel,
      conversion,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
