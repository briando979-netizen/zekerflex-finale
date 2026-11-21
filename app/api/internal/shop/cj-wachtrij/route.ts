import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { rondeWachtrij } from "@/lib/shop/cj/wachtrij";
import { WEBSHOP_AAN } from "@/lib/shop/aan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cron (elke 2 minuten): één ronde van de wachtrij "Alles overnemen" (lib/shop/cj/wachtrij.ts): hooguit vier producten,
// binnen 100 s, met de bestaande claims. Zonder wachtrij doet hij niets en telt hij toch als geslaagd (hartslag).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  // de webshop staat uit (lib/shop/aan.ts): niets doen, wel de hartslag (Beheer → Systeem → Taken blijft groen)
  if (!WEBSHOP_AAN) {
    recordCronRun("cj-wachtrij", true);
    return NextResponse.json({ ok: true, uit: "De webshop staat uit." });
  }
  try {
    const uitslag = await rondeWachtrij({ budgetMs: 100_000 });
    recordCronRun("cj-wachtrij", true);
    return NextResponse.json(uitslag);
  } catch (err) {
    recordCronRun("cj-wachtrij", false);
    logger.error("cj-wachtrij mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Ronde mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
