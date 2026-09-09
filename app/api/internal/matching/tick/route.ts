import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { processMatchingFollowups } from "@/lib/notifications/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron entrypoint for the matching follow-up worker. Ideally hit every
 * 30-60s, but vercel.json currently schedules it once daily — Vercel's
 * Hobby plan only allows daily cron jobs (Pro+ unlocks sub-daily). If/when
 * this project moves to Pro, tighten the schedule in vercel.json; a
 * non-Vercel scheduler (GitHub Actions, k8s CronJob) hitting this with the
 * `x-internal-token` header (or `?token=`) can already run as often as needed.
 */
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }

  try {
    const result = await processMatchingFollowups();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("matching tick failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Tick failed" } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
