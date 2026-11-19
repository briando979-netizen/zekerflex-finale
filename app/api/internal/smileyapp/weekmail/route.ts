import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { SMILEYAPP_WEEKMAIL_JOB, stuurWeekmail } from "@/lib/voorstel/smileyapp-weekmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Elke ochtend (deploy/cron/entrypoint.sh, 05:00, 06:00 en 07:00 UTC): de wekelijkse mail aan de beheerders van het
// SmileyApp-voorstel (lib/voorstel/smileyapp-weekmail.ts). De cron draait in UTC en vraagt het daarom een paar keer:
// alleen op maandag vanaf 07:00 Nederlandse tijd gaat de mail weg, en per week precies één keer. Een ronde die niets
// hoeft te doen (geen maandag, te vroeg, al verstuurd, schakelaar uit, geen beheerder) telt als gelukt; zo blijft de
// hartslag elke dag vers. In de log alleen aantallen, geen adressen.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const uitslag = await stuurWeekmail();
    logger.info("smileyapp weekmail", { verstuurd: uitslag.verstuurd, reden: uitslag.reden ?? null });
    await recordCronHeartbeat(SMILEYAPP_WEEKMAIL_JOB, true);
    return NextResponse.json({ ok: true, ...uitslag });
  } catch (e) {
    await recordCronHeartbeat(SMILEYAPP_WEEKMAIL_JOB, false);
    return NextResponse.json({ error: { code: "INTERNAL", message: (e as Error).message } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
