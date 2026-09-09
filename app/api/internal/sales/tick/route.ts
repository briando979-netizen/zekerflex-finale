import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { runSalesEngineTick } from "@/lib/sales/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron entrypoint for the sales-recruiter motor. Ideally hit every ~15 min,
 * but vercel.json currently schedules it once daily — Vercel's Hobby plan
 * only allows daily cron jobs (Pro+ unlocks sub-daily; tighten the schedule
 * there if this project upgrades). A non-Vercel scheduler hitting this with
 * the `x-internal-token` header can already run as often as needed. The
 * engine is a no-op unless SALES_ENGINE_ENABLED is true and no kill-switch is set.
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
    const result = await runSalesEngineTick();
    recordCronRun("sales-motor", true);
    return NextResponse.json(result);
  } catch (err) {
    recordCronRun("sales-motor", false);
    logger.error("sales tick failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Tick failed" } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
