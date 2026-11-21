import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { rondeVerhuizenAchtergrond, zetVerhuisStand } from "@/lib/shop/cj/fotos-verhuizen";
import { WEBSHOP_AAN } from "@/lib/shop/aan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron (elke 5 minuten): één ronde CJ-foto's van de database naar schijf, alleen zolang de vlag aan staat
// (lib/shop/cj/fotos-verhuizen.ts). Met ?start=1 (zelfde token) gaat de vlag aan: zo kan de verhuizing vanaf de server
// gestart worden als de eigenaar daar toestemming voor geeft zonder zelf in Beheer te klikken (18 nov 2026).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  // de webshop staat uit (lib/shop/aan.ts): niets doen, wel de hartslag (Beheer → Systeem → Taken blijft groen)
  if (!WEBSHOP_AAN) {
    recordCronRun("cj-fotos-verhuizen", true);
    return NextResponse.json({ ok: true, uit: "De webshop staat uit." });
  }
  try {
    const start = new URL(request.url).searchParams.get("start") === "1";
    if (start) {
      const stand = await zetVerhuisStand(true);
      await recordAudit({ category: "ADMIN", action: "shop.cj.fotos-verhuizing-gestart", actorUserId: null, actorLabel: "system:cj", summary: "CJ-foto's naar schijf: verhuizing op de achtergrond gestart via de interne route (toestemming eigenaar)", targetType: "shop", targetId: "cj-fotos" });
      recordCronRun("cj-fotos-verhuizen", true);
      return NextResponse.json({ status: "gestart", stand });
    }
    const uitslag = await rondeVerhuizenAchtergrond({ budgetMs: 200_000 });
    recordCronRun("cj-fotos-verhuizen", true);
    return NextResponse.json(uitslag);
  } catch (err) {
    recordCronRun("cj-fotos-verhuizen", false);
    logger.error("cj-fotos-verhuizen mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Ronde mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
