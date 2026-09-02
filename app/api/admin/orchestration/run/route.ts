import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { runOrchestrationCycle } from "@/lib/orchestration/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/orchestration/run - trigger one observe->interpret cycle.
export async function POST(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const result = await runOrchestrationCycle({
      trigger: "MANUAL",
      actorUserId: principal.userId,
    });
    return NextResponse.json(result, {
      status: result.status === "FAILED" ? 502 : 200,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("orchestration run failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
