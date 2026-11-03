import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { stuurHerinneringen } from "@/lib/rijschool/herinnering";
import { stuurAutomails } from "@/lib/rijschool/automailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Elke dag om 17:00 UTC (deploy/cron/entrypoint.sh): herinneringsmail aan
// leerlingen met morgen een les (lib/rijschool/herinnering.ts), en daarna de
// automailer van elke rijschool (lib/rijschool/automailer.ts).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const result = await stuurHerinneringen();
    // de automailer (tegoed bijna op, na de proefles, lang niet gereden) loopt in dezelfde ronde
    const automail = await stuurAutomails();
    recordCronRun("rijschool-herinneringen", true);
    return NextResponse.json({ ok: true, ...result, automail });
  } catch (err) {
    recordCronRun("rijschool-herinneringen", false);
    logger.error("rijschool herinneringen failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Herinneringen mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
