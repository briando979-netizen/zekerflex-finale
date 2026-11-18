import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { recordCronRun } from "@/lib/metrics";
import { INFO_MAIL_JOB, loopInfoNa } from "@/lib/mail/info-ronde";
import { echteInfoAfhankelijkheden } from "@/lib/mail/info-ronde-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 100;

// Elke 5 minuten (deploy/cron/entrypoint.sh): de postbus info@ indelen (lib/mail/info-ronde.ts). Standaard de
// proefstand (vlag "info-mail-afhandelen" uit): dan schrijft hij alleen op wat hij zou doen; ook dat telt als een
// geslaagde run. Een storing in de postbus of de KV breekt niets: de volgende ronde probeert het opnieuw.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });

  try {
    const stand = await loopInfoNa(echteInfoAfhankelijkheden());
    // alleen aantallen, nooit een adres of onderwerp
    logger.info("info-mail", { proef: stand.proef, nieuw: stand.nieuw, ...stand.perSoort, ...stand.gedaan, ...(stand.fout ? { fout: stand.fout } : {}) });
    // geen postbus ingesteld is geen storing van deze taak; een postbus die niet te lezen is wel
    const ok = !stand.fout || /GeenPostbus/.test(stand.fout);
    recordCronRun(INFO_MAIL_JOB, ok);
    return NextResponse.json({ proef: stand.proef, nieuw: stand.nieuw, perSoort: stand.perSoort, gedaan: stand.gedaan, ...(stand.fout ? { fout: stand.fout } : {}) }, { status: ok ? 200 : 503 });
  } catch (e) {
    logger.error("info-mail: de ronde is vastgelopen", { soort: e instanceof Error ? e.name : "onbekend" });
    recordCronRun(INFO_MAIL_JOB, false);
    return NextResponse.json({ error: { code: "INTERNAL", message: "De info-ronde is mislukt." } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
