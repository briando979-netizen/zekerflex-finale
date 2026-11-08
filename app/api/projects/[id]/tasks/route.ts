import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createTask, getTasksByProject } from "@/lib/tasks/manager";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tasks = await getTasksByProject(params.id);
    return NextResponse.json({ tasks });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const data = await request.json();

    const task = await createTask(params.id, principal.userId, data);
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
