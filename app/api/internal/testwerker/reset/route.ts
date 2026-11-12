import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { recordCronRun } from "@/lib/metrics";
import { resetTestwerker } from "@/lib/testwerker/reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elk uur (cron "5 * * * *", deploy/cron/entrypoint.sh): het testwerkeraccount van de eigenaar terug naar
// "net aangemeld" (lib/testwerker/reset.ts). Eigen geheim, zoals elke /api/internal-route.
//   ?droog=1 → alleen tellen, er verandert niets
// Zonder TESTWERKER_EMAIL doet hij niets en telt de run als geslaagd. Het antwoord bevat alleen aantallen.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  const droog = new URL(request.url).searchParams.get("droog") === "1";
  try {
    const uitslag = await resetTestwerker({ droog });
    // ook "uit", "geen account" en "geweigerd" zijn een geslaagde run: er hoort dan niets te gebeuren
    if (!droog) recordCronRun("testwerker-reset", true);
    if (uitslag.status === "geweigerd") logger.warn("testwerker niet teruggezet", { reden: uitslag.reden });
    return NextResponse.json({ ok: true, ...uitslag });
  } catch (err) {
    if (!droog) recordCronRun("testwerker-reset", false);
    logger.error("testwerker terugzetten mislukt", { fout: err instanceof Error ? err.message : "onbekend" });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Terugzetten mislukt." } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
