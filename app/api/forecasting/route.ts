import { NextRequest, NextResponse } from "next/server";
import { predictDemand, forecastFinancials, forecastCapacity, predictChurn, analyzeTrends, runScenarioAnalysis } from "@/lib/forecasting";
import { requirePrincipal } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requirePrincipal();
    const { type, data } = await request.json();

    if (type === "demand") {
      const forecast = await predictDemand(data.productId);
      return NextResponse.json({ type: "demand", forecast });
    }

    if (type === "financial") {
      const forecast = forecastFinancials(data.revenue, data.expenses);
      return NextResponse.json({ type: "financial", forecast });
    }

    if (type === "capacity") {
      const forecast = forecastCapacity(data.capacity, data.growth);
      return NextResponse.json({ type: "capacity", forecast });
    }

    if (type === "churn") {
      const risks = predictChurn(data.customers);
      return NextResponse.json({ type: "churn", risks });
    }

    if (type === "trends") {
      const analysis = analyzeTrends(data.timeSeries);
      return NextResponse.json({ type: "trends", analysis });
    }

    if (type === "scenarios") {
      const results = runScenarioAnalysis(data.baselineRevenue, data.baselineExpenses, data.scenarios);
      return NextResponse.json({ type: "scenarios", results });
    }

    return NextResponse.json({ error: "Unknown forecast type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Forecast failed" }, { status: 500 });
  }
}
