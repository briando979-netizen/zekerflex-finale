import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { verstuurGepland } from "@/lib/messaging/gepland";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (elke minuut, deploy/cron/entrypoint.sh): de geplande chatberichten die aan de beurt zijn versturen
// (lib/messaging/gepland.ts, "later versturen"). Eigen shared-secret auth.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const uitslag = await verstuurGepland();
    recordCronRun("chat-gepland", true);
    return NextResponse.json(uitslag);
  } catch (err) {
    recordCronRun("chat-gepland", false);
    logger.error("chat-gepland mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Versturen mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
