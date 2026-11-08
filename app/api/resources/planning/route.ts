import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createResource, getResourceUtilization, detectConflicts, optimizeAllocation } from "@/lib/resources/manager";
import { forecastCapacity, detectBottlenecks } from "@/lib/capacity/planner";
import { forecastResourceDemand, costProjection, riskAssessment } from "@/lib/forecasting/projector";
import { scheduleResources, resolveConflicts, optimizeSchedule, balanceLoad, priorityManagement, autoSchedule } from "@/lib/scheduling/advanced";
import { utilizationReport, efficiencyMetrics, costAnalysis, roiAnalysis, trendAnalysis, benchmarking } from "@/lib/resources/analytics";
import { optimizeResources, minimizeCosts, maximizeUtilization, balanceRisk, scenarioModeling, recommendations } from "@/lib/optimization/engine";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("MANAGER");

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const resourceId = searchParams.get("resourceId");
    const projectId = searchParams.get("projectId");

    if (action === "utilization" && resourceId) {
      const result = await getResourceUtilization(resourceId);
      return NextResponse.json({ utilization: result });
    }

    if (action === "conflicts" && resourceId) {
      const result = await detectConflicts(resourceId);
      return NextResponse.json({ conflicts: result });
    }

    if (action === "forecast" && resourceId) {
      const result = await forecastCapacity(resourceId);
      return NextResponse.json({ forecast: result });
    }

    if (action === "bottlenecks" && projectId) {
      const result = await detectBottlenecks(projectId);
      return NextResponse.json({ bottlenecks: result });
    }

    if (action === "analytics" && resourceId) {
      const util = await utilizationReport(resourceId);
      const trend = await trendAnalysis(resourceId);
      const bench = await benchmarking(resourceId);
      return NextResponse.json({ utilization: util, trend, benchmark: bench });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("MANAGER");

    const body = await request.json();
    const { action, projectId, resourceId } = body;

    if (action === "optimize" && projectId) {
      const result = await optimizeResources(projectId);
      return NextResponse.json({ optimized: result }, { status: 200 });
    }

    if (action === "schedule" && projectId) {
      const result = await autoSchedule(projectId);
      return NextResponse.json({ scheduled: result }, { status: 200 });
    }

    if (action === "scenario" && projectId) {
      const result = await scenarioModeling(projectId, body.variables);
      return NextResponse.json({ scenario: result }, { status: 200 });
    }

    if (action === "recommendations" && projectId) {
      const result = await recommendations(projectId);
      return NextResponse.json({ recommendations: result }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
