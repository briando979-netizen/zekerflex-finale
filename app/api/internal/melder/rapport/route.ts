import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { stuurDagrapport, stuurWachtOpJou } from "@/lib/ops/dagrapport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?soort=dag (elke avond 20:00 UTC): het dagrapport naar de telefoon van de eigenaar.
// ?soort=wacht (elke ochtend 07:30 UTC): "dit wacht op jou", alleen als er iets dringends of iets van meer dan 24 uur wacht.
// Eén keer per dag per soort (lib/ops/dagrapport.ts); doet niets met de meldingen uit of buiten 07:00 tot 23:00 Amsterdam.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  const soort = new URL(request.url).searchParams.get("soort") === "wacht" ? "wacht" : "dag";
  // vaste namen in de aanroep: de bewaker tests/cron-hartslag-ronde.test.ts zoekt ze zo
  const hartslag = (ok: boolean): void => {
    if (soort === "wacht") void recordCronHeartbeat("melder-wacht", ok);
    else void recordCronHeartbeat("melder-dagrapport", ok);
  };
  try {
    const uitslag = soort === "wacht" ? await stuurWachtOpJou() : await stuurDagrapport();
    hartslag(true);
    return NextResponse.json(uitslag);
  } catch (err) {
    hartslag(false);
    logger.error("melder rapport failed", { soort, error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Rapport mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
