import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { runAutopilot } from "@/lib/autopilot";
import { checkCronHeartbeats } from "@/lib/ops/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Autopilot cron (morning + afternoon, vercel.json): reminders, rescuing
// unfilled shifts, consented auto-approvals, brain upkeep, admin day report.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const report = await runAutopilot("cron");
    recordCronRun("autopilot", report.ran.every((r) => r.ok));
    // second, independent trigger for the missing-cron watchdog (besides ai-watchdog)
    const crons = await checkCronHeartbeats().catch(() => ({ stale: [] as string[] }));
    return NextResponse.json({ ok: true, ...report, staleCrons: crons.stale });
  } catch (err) {
    recordCronRun("autopilot", false);
    logger.error("autopilot tick failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Autopilot failed" } }, { status: 500 });
  }
}

export const GET = handle;
