import { NextResponse } from "next/server";
import { runOrchestrationCycle } from "@/lib/orchestration/core";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/orchestration/run - trigger one observe->interpret cycle.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  const result = await runOrchestrationCycle({
    trigger: "MANUAL",
    actorUserId: principal.userId,
  });
  return NextResponse.json(result, {
    status: result.status === "FAILED" ? 502 : 200,
  });
});
