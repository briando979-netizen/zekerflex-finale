import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as builder from "@/lib/automation/builder";
import * as orchestration from "@/lib/automation/orchestration";
import * as integrations from "@/lib/automation/integrations";
import * as intelligence from "@/lib/automation/intelligence";
import * as execution from "@/lib/automation/execution";
import * as analytics from "@/lib/automation/analytics";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * GET /api/automation
 * List workflows or get analytics based on query params
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const searchParams = request.nextUrl.searchParams;

    const action = searchParams.get("action");
    const workflowId = searchParams.get("workflowId");
    const archived = searchParams.get("archived") === "true";
    const enabled = searchParams.get("enabled") === "true";

    switch (action) {
      case "list":
        const workflows = await builder.listWorkflows(principal.tenantId, {
          archived,
          enabled: enabled ? true : undefined,
        });
        return NextResponse.json({ workflows });

      case "metrics":
        if (!workflowId) {
          return NextResponse.json(
            { error: "workflowId is required" },
            { status: 400 }
          );
        }
        const metrics = await analytics.getWorkflowMetrics(workflowId, 30);
        return NextResponse.json({ metrics });

      case "aggregated":
        const aggMetrics = await analytics.getAggregatedMetrics(principal.tenantId, 30);
        return NextResponse.json({ metrics: aggMetrics });

      case "patterns":
        const patterns = await intelligence.discoverProcessPatterns(principal.tenantId);
        return NextResponse.json({ patterns });

      case "rpa-candidates":
        const candidates = await intelligence.identifyRpaCandidates(principal.tenantId);
        return NextResponse.json({ candidates });

      case "health":
        const health = await execution.healthCheck();
        return NextResponse.json(health);

      case "get":
        if (!workflowId) {
          return NextResponse.json(
            { error: "workflowId is required" },
            { status: 400 }
          );
        }
        const workflow = await builder.getWorkflow(principal.tenantId, workflowId);
        return NextResponse.json({ workflow });

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
 * POST /api/automation
 * Create workflow or trigger execution
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const actionType = (body.type as string) || "create_workflow";

    switch (actionType) {
      case "create_workflow":
        const workflow = await builder.createWorkflow(principal.tenantId, body.workflow);
        return NextResponse.json({ workflow }, { status: 201 });

      case "execute":
        if (!body.workflowId) {
          return NextResponse.json(
            { error: "workflowId is required" },
            { status: 400 }
          );
        }

        const execution_result = await orchestration.orchestrateWorkflow(
          principal.tenantId,
          body.workflowId,
          body.inputData || {},
          principal.userId
        );
        return NextResponse.json(execution_result, { status: 200 });

      case "setup_connector":
        const connector = await integrations.setupConnector(
          principal.tenantId,
          body.name,
          body.config
        );
        return NextResponse.json({ connector }, { status: 201 });

      case "test_connector":
        const testResult = await integrations.testConnector(
          principal.tenantId,
          body.connectorId
        );
        return NextResponse.json(testResult, { status: 200 });

      case "clone_workflow":
        const cloned = await builder.cloneWorkflow(
          principal.tenantId,
          body.workflowId,
          body.newName
        );
        return NextResponse.json({ workflow: cloned }, { status: 201 });

      case "approve_step":
        const approveResult = await orchestration.approveStep(
          body.runId,
          principal.userId
        );
        return NextResponse.json(approveResult, { status: 200 });

      case "reject_step":
        const rejectResult = await orchestration.rejectStep(
          body.runId,
          principal.userId,
          body.reason
        );
        return NextResponse.json(rejectResult, { status: 200 });

      case "retry_execution":
        const retryResult = await execution.retryExecution(
          principal.tenantId,
          body.runId
        );
        return NextResponse.json(retryResult, { status: 200 });

      case "webhook":
        const webhookResult = await integrations.processWebhook(
          principal.tenantId,
          body.connectorId,
          body.payload
        );
        return NextResponse.json(
          { workflows_triggered: webhookResult.length },
          { status: 200 }
        );

      default:
        return NextResponse.json(
          { error: "Unknown action type" },
          { status: 400 }
        );
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PUT /api/automation/:workflowId
 * Update workflow
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const workflowId = request.nextUrl.pathname.split("/").pop();

    if (!workflowId) {
      return NextResponse.json(
        { error: "workflowId is required" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const workflow = await builder.updateWorkflow(
      principal.tenantId,
      workflowId,
      body
    );

    return NextResponse.json({ workflow });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * DELETE /api/automation/:workflowId
 * Archive/delete workflow
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const workflowId = request.nextUrl.pathname.split("/").pop();

    if (!workflowId) {
      return NextResponse.json(
        { error: "workflowId is required" },
        { status: 400 }
      );
    }

    // Archive workflow
    await builder.updateWorkflow(principal.tenantId, workflowId, {
      isArchived: true,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
