import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { recordCronRun } from "@/lib/metrics";
import { MAIL_BOUNCES_JOB, rondBouncesAf } from "@/lib/mail/bounce-ronde";
import { echteBounceAfhankelijkheden } from "@/lib/mail/bounce-ronde-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Elk uur (deploy/cron/entrypoint.sh): terugkaatsers in de postbus nalezen (lib/mail/bounce-ronde.ts). Standaard uit
// (vlag "mail-bounce-verwerken"): dan alleen lezen, indelen en tellen in KV meting:mail-bounces; ook dat telt als een
// geslaagde run. Een storing in de postbus of de KV breekt niets: de run meldt hem en de volgende probeert het opnieuw.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });

  try {
    const meting = await rondBouncesAf(echteBounceAfhankelijkheden());
    // alleen aantallen en codes, nooit een adres
    logger.info("mail-bounces", { droog: meting.droog, nieuw: meting.nieuw, ...meting.venster, ...meting.gedaan, ...(meting.fout ? { fout: meting.fout } : {}) });
    // geen postbus ingesteld is geen storing van deze taak; een postbus die niet te lezen is wel
    const ok = !meting.fout || /GeenPostbus/.test(meting.fout);
    recordCronRun(MAIL_BOUNCES_JOB, ok);
    return NextResponse.json(meting, { status: ok ? 200 : 503 });
  } catch (e) {
    logger.error("mail-bounces: de ronde is vastgelopen", { soort: e instanceof Error ? e.name : "onbekend" });
    recordCronRun(MAIL_BOUNCES_JOB, false);
    return NextResponse.json({ error: { code: "INTERNAL", message: "De bounce-ronde is mislukt." } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
