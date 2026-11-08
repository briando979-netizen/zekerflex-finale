import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getWorkflow, getWorkflowMetrics, getExecutionStats, getErrorReport } from "@/lib/workflows";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  workflowId: z.string(),
  metric: z.enum(["overview", "stats", "errors"]).optional(),
  period: z.enum(["day", "week", "month"]).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const query = querySchema.parse({
      workflowId: request.nextUrl.searchParams.get("workflowId"),
      metric: request.nextUrl.searchParams.get("metric"),
      period: request.nextUrl.searchParams.get("period") || "week",
    });

    const workflow = await getWorkflow(query.workflowId);
    if (!workflow || workflow.createdBy !== principal.userId) {
      throw AppError.forbidden("Not authorized");
    }

    const metric = query.metric || "overview";

    if (metric === "overview") {
      const metrics = await getWorkflowMetrics(query.workflowId);
      return NextResponse.json({ metrics });
    }

    if (metric === "stats") {
      const stats = await getExecutionStats(query.workflowId, (query.period || "week") as "day" | "week" | "month");
      return NextResponse.json({ stats });
    }

    if (metric === "errors") {
      const errors = await getErrorReport(query.workflowId);
      return NextResponse.json({ errors });
    }

    throw AppError.validation("Invalid metric");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
