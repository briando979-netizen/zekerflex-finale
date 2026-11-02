import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { runWeeklySiteChecks } from "@/lib/website/uptime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Elke maandag (deploy/cron/entrypoint.sh): website-check op elke beheerde klantsite.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    return NextResponse.json(await runWeeklySiteChecks());
  } catch (err) {
    recordCronRun("site-weekly-check", false);
    logger.error("weekly site checks failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Weekly site checks failed" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
