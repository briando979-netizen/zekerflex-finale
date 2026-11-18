import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { featureEnabled } from "@/lib/flags";
import { PIJPLIJN_FLAG, runWebsitePijplijn, stuurPijplijnDagoverzicht } from "@/lib/sales/website-pijplijn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: de automatische websitepijplijn. Zoekt open leads met een bekende site,
 * maakt er hooguit een paar websitevoorstellen (concept + nieuwe site) voor, en
 * stuurt de eigenaar één samenvatting. Verstuurt NOOIT iets naar een bedrijf.
 * Doet niets zolang de vlag "sales-website-pijplijn" uit staat (dan telt de run
 * toch als geslaagd, zodat de watchdog geen vals alarm geeft).
 */
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    if (!(await featureEnabled(PIJPLIJN_FLAG))) {
      recordCronRun("sales-pijplijn", true);
      return NextResponse.json({ uit: true });
    }
    const result = await runWebsitePijplijn();
    await stuurPijplijnDagoverzicht(result).catch((err) => logger.warn("pijplijn-dagoverzicht mislukt", { error: (err as Error).message }));
    recordCronRun("sales-pijplijn", true);
    return NextResponse.json(result);
  } catch (err) {
    recordCronRun("sales-pijplijn", false);
    logger.error("website-pijplijn tick failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Tick failed" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
