import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getWorkflow, WorkflowExecutor, saveExecution } from "@/lib/workflows";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const executeSchema = z.object({
  workflowId: z.string(),
  data: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { workflowId, data } = executeSchema.parse(body);

    const workflow = await getWorkflow(workflowId);
    if (!workflow) throw AppError.notFound("Workflow not found");

    if (workflow.createdBy !== principal.userId) {
      throw AppError.forbidden("Not authorized");
    }

    if (!workflow.enabled) {
      throw AppError.validation("Workflow is disabled");
    }

    const execution = await WorkflowExecutor.execute(workflow, data || {});
    await saveExecution(execution);

    return NextResponse.json({ execution }, { status: 202 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
