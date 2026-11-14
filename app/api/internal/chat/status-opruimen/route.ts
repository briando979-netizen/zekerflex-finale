import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { ruimStatusOp } from "@/lib/messaging/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (elk uur, deploy/cron/entrypoint.sh): verlopen statussen in de chat weghalen, met hun foto
// (lib/messaging/status.ts), ook van wie niemand meer kijkt. Eigen shared-secret auth.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const weg = await ruimStatusOp();
    recordCronRun("chat-status-opruimen", true);
    return NextResponse.json({ weg });
  } catch (err) {
    recordCronRun("chat-status-opruimen", false);
    logger.error("chat-status-opruimen mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Opruimen mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
