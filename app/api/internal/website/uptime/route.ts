import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { runUptimeSweep } from "@/lib/website/uptime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Elke 5 minuten (deploy/cron/entrypoint.sh): beheerde klantsites meten.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    return NextResponse.json(await runUptimeSweep());
  } catch (err) {
    recordCronRun("site-uptime", false);
    logger.error("uptime sweep failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Uptime sweep failed" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
