import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { sweepMailboxes } from "@/lib/agenda/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron entrypoint: reads new mail in every connected mailbox for appointments,
// also for people who didn't open ZekerFlex that day. Opening the mailbox
// triggers the same scan right away.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const result = await sweepMailboxes();
    recordCronRun("agenda-mail-sweep", true);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    recordCronRun("agenda-mail-sweep", false);
    logger.error("agenda mail sweep failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Sweep failed" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
