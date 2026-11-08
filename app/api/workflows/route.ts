import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createWorkflow, listWorkflows, getWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/workflows";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const workflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const workflows = await listWorkflows(principal.userId);
    return NextResponse.json({ workflows });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const data = workflowSchema.parse(body);

    const workflow = await createWorkflow({
      name: data.name,
      description: data.description,
      userId: principal.userId,
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const id = request.nextUrl.searchParams.get("id");

    if (!id) throw AppError.validation("Workflow ID required");

    const workflow = await getWorkflow(id);
    if (!workflow || workflow.createdBy !== principal.userId) {
      throw AppError.forbidden("Not authorized");
    }

    const body = await request.json();
    const updates = workflowSchema.partial().parse(body);

    const updated = await updateWorkflow(id, updates);
    return NextResponse.json({ workflow: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const id = request.nextUrl.searchParams.get("id");

    if (!id) throw AppError.validation("Workflow ID required");

    const workflow = await getWorkflow(id);
    if (!workflow || workflow.createdBy !== principal.userId) {
      throw AppError.forbidden("Not authorized");
    }

    await deleteWorkflow(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
