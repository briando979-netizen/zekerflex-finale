import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { runOrchestrationCycle } from "@/lib/orchestration/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint for the autonomous orchestration cycle (e.g. every 6h).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  try {
    const result = await runOrchestrationCycle({ trigger: "CRON" });
    return NextResponse.json({ ok: result.status === "COMPLETED", ...result });
  } catch (err) {
    logger.error("orchestration tick failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Tick failed" } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
