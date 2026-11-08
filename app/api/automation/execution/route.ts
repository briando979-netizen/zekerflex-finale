import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as execution from "@/lib/automation/execution";

export const dynamic = "force-dynamic";

/**
 * GET /api/automation/execution
 * Get execution logs and stats
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const searchParams = request.nextUrl.searchParams;

    const action = searchParams.get("action");
    const runId = searchParams.get("runId");
    const workflowId = searchParams.get("workflowId");

    if (!runId && !workflowId) {
      return NextResponse.json(
        { error: "runId or workflowId is required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "logs":
        if (!runId) {
          return NextResponse.json(
            { error: "runId is required for logs" },
            { status: 400 }
          );
        }

        const logs = await execution.getExecutionLogs(runId, {
          limit: 100,
        });
        return NextResponse.json({ logs });

      case "stats":
        if (!workflowId) {
          return NextResponse.json(
            { error: "workflowId is required for stats" },
            { status: 400 }
          );
        }

        const stats = await execution.getExecutionStats(workflowId, 30);
        return NextResponse.json({ stats });

      case "health":
        const health = await execution.healthCheck();
        return NextResponse.json(health);

      default:
        if (runId) {
          const logs = await execution.getExecutionLogs(runId, { limit: 50 });
          return NextResponse.json({ logs });
        }
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/automation/execution
 * Retry or cancel execution
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const action = body.action;
    const runId = body.runId;

    if (!runId) {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "retry":
        const retryResult = await execution.retryExecution(principal.tenantId, runId);
        return NextResponse.json(retryResult);

      case "cancel":
        const cancelResult = await execution.cancelExecution(principal.tenantId, runId);
        return NextResponse.json(cancelResult);

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * Stream execution logs in real-time
 */
export async function STREAM(
  request: NextRequest
): Promise<ReadableStream<Uint8Array>> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const runId = searchParams.get("runId");

    if (!runId) {
      throw new AppError.validation("runId is required");
    }

    return execution.monitorExecution(runId) as any;
  } catch (err) {
    const { status, body } = toErrorBody(err);
    throw err;
  }
}
