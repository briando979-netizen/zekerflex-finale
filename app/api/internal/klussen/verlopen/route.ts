import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { recordCronRun } from "@/lib/metrics";
import { KLUSSEN_VERLOPEN_JOB, rondVerlopenAf } from "@/lib/shifts/verlopen";
import { echteVerlopenAfhankelijkheden } from "@/lib/shifts/verlopen-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Elke nacht (deploy/cron/entrypoint.sh): klussen waarvan de eindtijd ruim voorbij is en waar nog iemand op staat,
// gaan naar COMPLETED (lib/shifts/verlopen.ts). Geen mail, geen push. Standaard uit (vlag "klussen-verlopen-sluiten"):
// dan telt hij alleen en bewaart hij de stand in KV (meting:klussen-verlopen); ook dat telt als een geslaagde run.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });

  try {
    const meting = await rondVerlopenAf(echteVerlopenAfhankelijkheden());
    logger.info("klussen na afloop", { droog: meting.droog, gevonden: meting.gevonden, gesloten: meting.gesloten, zonderInschrijving: meting.zonderInschrijving });
    recordCronRun(KLUSSEN_VERLOPEN_JOB, true);
    return NextResponse.json(meting);
  } catch (e) {
    logger.error("klussen na afloop: de taak is vastgelopen", { soort: e instanceof Error ? e.name : "onbekend" });
    recordCronRun(KLUSSEN_VERLOPEN_JOB, false);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Klussen na afloop afronden is mislukt." } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
