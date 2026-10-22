import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { sweepWorkerPushes } from "@/lib/notifications/worker-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Werknemer pushes (uitgekozen, morgen/over 2 uur/nu-herinneringen, gegevens
// invullen). Runs from this cron AND, throttled, from every notifications poll
// (lib/notifications/worker-push.ts maybeSweepWorkerPushes) — the cron is the
// safety net for quiet periods. An uptime pinger may call it more often.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const result = await sweepWorkerPushes();
    recordCronRun("worker-push-sweep", true);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    recordCronRun("worker-push-sweep", false);
    logger.error("worker push sweep failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Sweep failed" } }, { status: 500 });
  }
}

export const GET = handle;
