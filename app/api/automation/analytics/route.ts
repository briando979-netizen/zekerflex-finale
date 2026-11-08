import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as analytics from "@/lib/automation/analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/automation/analytics
 * Get analytics and optimization recommendations
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const searchParams = request.nextUrl.searchParams;

    const action = searchParams.get("action");
    const workflowId = searchParams.get("workflowId");

    if (!workflowId) {
      return NextResponse.json(
        { error: "workflowId is required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "bottlenecks":
        const bottlenecks = await analytics.identifyBottlenecks(workflowId, 5);
        return NextResponse.json({ bottlenecks });

      case "recommendations":
        const recommendations = await analytics.generateRecommendations(workflowId);
        return NextResponse.json({ recommendations });

      case "trends":
        const trends = await analytics.calculateTrends(workflowId, 30);
        return NextResponse.json({ trends });

      case "roi":
        const roi = await analytics.calculateROI(workflowId);
        return NextResponse.json({ roi });

      case "metrics":
      default:
        const metrics = await analytics.getWorkflowMetrics(workflowId, 30);
        return NextResponse.json({ metrics });
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/automation/analytics
 * Record metrics
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    if (!body.workflowId) {
      return NextResponse.json(
        { error: "workflowId is required" },
        { status: 400 }
      );
    }

    const metric = await analytics.recordWorkflowMetrics(
      body.workflowId,
      new Date()
    );

    return NextResponse.json({ metric });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
