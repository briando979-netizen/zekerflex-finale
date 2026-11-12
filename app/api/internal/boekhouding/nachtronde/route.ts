import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { recordCronRun } from "@/lib/metrics";
import { echteAfhankelijkheden } from "@/lib/boekhouding/nachtronde";
import { NACHTRONDE_JOB, draaiNachtronde } from "@/lib/boekhouding/nachtronde-kern";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Elke nacht (deploy/cron/entrypoint.sh): per echte administratie facturen boeken, bank koppelen (alleen wat zeker is),
// het btw-concept bijwerken, en de eigenaar waarschuwen voor deadlines en werk bij even kijken. Het systeem dient nooit
// zelf btw in. Standaard uit (flag "boekhouding-nachtronde"); dan doet hij niets en blijft alleen de hartslag staan.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });

  try {
    const uitkomst = await draaiNachtronde(echteAfhankelijkheden());
    if (uitkomst.status === "uit") {
      // "uit" telt als gelukt: de taak draait, hij hoeft alleen niets te doen (anders slaat de hartslagbewaking alarm)
      recordCronRun(NACHTRONDE_JOB, true);
      return NextResponse.json({ status: "uit" });
    }
    const ok = uitkomst.uitslag.fouten === 0;
    recordCronRun(NACHTRONDE_JOB, ok);
    return NextResponse.json({ status: "gedraaid", fouten: uitkomst.uitslag.fouten, ms: uitkomst.uitslag.ms }, { status: ok ? 200 : 500 });
  } catch (e) {
    // bv. de vlag-opslag is weg: niet stil falen
    logger.error("boekronde: de taak is vastgelopen", { soort: e instanceof Error ? e.name : "onbekend" });
    recordCronRun(NACHTRONDE_JOB, false);
    return NextResponse.json({ error: { code: "INTERNAL", message: "De nachtelijke boekhoudronde is mislukt." } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
