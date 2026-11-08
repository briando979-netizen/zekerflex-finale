import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";
import { forecastFinancials, saveForecast } from "@/lib/fpa/forecasting";
import { createBudget, trackBudgetUsage } from "@/lib/fpa/budgeting";
import { analyzeVariance, rootCauseAnalysis, trendAnalysis } from "@/lib/fpa/variance-analysis";
import { consolidateMultiEntity } from "@/lib/fpa/consolidation";
import { generateFinancialReport, generateDashboard } from "@/lib/fpa/reporting";

export const dynamic = "force-dynamic";

const forecastSchema = z.object({
  entityId: z.string(),
  period: z.string(),
  revenueBase: z.number(),
  revenueGrowth: z.number().optional(),
  expenseBase: z.number(),
  expenseGrowth: z.number().optional(),
});

const budgetSchema = z.object({
  entityId: z.string(),
  period: z.string(),
  revenueTarget: z.number(),
  expenseTarget: z.number(),
  allocations: z.array(z.object({ department: z.string(), budget: z.number() })),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("FINANCE_MANAGER");

    const body = await request.json();
    const action = request.nextUrl.searchParams.get("action");

    if (action === "forecast") {
      const validated = forecastSchema.parse(body);
      const forecasts = await forecastFinancials(validated);
      await saveForecast(validated.entityId, forecasts);
      return NextResponse.json({ success: true, count: forecasts.length }, { status: 201 });
    }

    if (action === "budget") {
      const validated = budgetSchema.parse(body);
      const result = await createBudget(validated);
      return NextResponse.json(result, { status: 201 });
    }

    throw AppError.validation("Invalid action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("FINANCE_MANAGER");

    const entityId = request.nextUrl.searchParams.get("entityId");
    const period = request.nextUrl.searchParams.get("period");
    const action = request.nextUrl.searchParams.get("action");

    if (!entityId) throw AppError.validation("entityId required");

    if (action === "variance" && period) {
      const budget = await prisma.budget.findFirst({ where: { entityId, period } });
      if (!budget) throw AppError.notFound("Budget not found");
      const variance = await analyzeVariance(budget.id);
      return NextResponse.json(variance);
    }

    if (action === "trends") {
      const trends = await trendAnalysis(entityId, 12);
      return NextResponse.json(trends);
    }

    if (action === "report" && period) {
      const report = await generateFinancialReport(entityId, period);
      return NextResponse.json(report);
    }

    if (action === "dashboard") {
      const dashboard = await generateDashboard(entityId);
      return NextResponse.json(dashboard);
    }

    throw AppError.validation("Invalid action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
