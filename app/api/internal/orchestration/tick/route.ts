import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { runOrchestrationCycle } from "@/lib/orchestration/core";
import { runTeams } from "@/lib/ai-teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron entrypoint for the autonomous orchestration cycle (e.g. every 6h).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  // The AI-teams run first and on their own — they work from data and don't
  // depend on the language model the orchestration cycle below needs.
  const teams = await runTeams().catch((err) => ({ error: (err as Error).message }));
  try {
    const result = await runOrchestrationCycle({ trigger: "CRON" });
    recordCronRun("orchestration", true);
    return NextResponse.json({ ok: result.status === "COMPLETED", ...result, teams });
  } catch (err) {
    recordCronRun("orchestration", false);
    logger.error("orchestration tick failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Tick failed" }, teams },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
