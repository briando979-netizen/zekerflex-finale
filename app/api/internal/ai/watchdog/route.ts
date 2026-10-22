import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { checkLlm } from "@/lib/ai/watchdog";
import { checkCronHeartbeats } from "@/lib/ops/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ideally hit on a short interval (pings the local model, tracks up/down
// transitions, keeps it warm via keep_alive), but vercel.json currently
// schedules it once daily — Vercel's Hobby plan only allows daily cron jobs.
// A non-Vercel scheduler hitting this directly can already run as often as needed.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  try {
    const state = await checkLlm();
    // also check that every scheduled cron is still running (alerts if one went silent)
    const crons = await checkCronHeartbeats().catch(() => ({ stale: [] as string[] }));
    recordCronRun("ai-watchdog", true);
    return NextResponse.json({ ok: true, ...state, staleCrons: crons.stale });
  } catch (err) {
    recordCronRun("ai-watchdog", false);
    logger.warn("ai watchdog tick failed", { error: (err as Error).message });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export const GET = handle;
export const POST = handle;
