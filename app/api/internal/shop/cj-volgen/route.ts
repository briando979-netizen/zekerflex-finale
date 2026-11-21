import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { volgCjBestellingen } from "@/lib/shop/cj/bestelling";
import { WEBSHOP_AAN } from "@/lib/shop/aan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cron (elk half uur): open bestellingen bij CJ navragen (lib/shop/cj/bestelling.ts). Zodra CJ een track & trace heeft, gaat de
// webshopbestelling op verzonden en krijgt de klant de mail met de volglink; de beheerder krijgt mail en push.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  // de webshop staat uit (lib/shop/aan.ts): niets doen, wel de hartslag (Beheer → Systeem → Taken blijft groen)
  if (!WEBSHOP_AAN) {
    recordCronRun("cj-volgen", true);
    return NextResponse.json({ ok: true, uit: "De webshop staat uit." });
  }
  try {
    const uitslag = await volgCjBestellingen();
    recordCronRun("cj-volgen", true);
    return NextResponse.json(uitslag);
  } catch (err) {
    recordCronRun("cj-volgen", false);
    logger.error("cj-volgen mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Ronde mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
