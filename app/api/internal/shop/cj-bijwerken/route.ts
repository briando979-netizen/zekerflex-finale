import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { rondeBijwerken } from "@/lib/shop/cj/bijwerken-ronde";
import { WEBSHOP_AAN } from "@/lib/shop/aan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cron (elke 4 minuten): één ronde "Categorie, voorraad en tekst bijwerken" over de CJ-producten
// (lib/shop/cj/bijwerken-ronde.ts), verder vanaf de cursor, binnen 75 s. Zonder CJ-producten doet hij niets en telt hij
// toch als geslaagd (hartslag).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  // de webshop staat uit (lib/shop/aan.ts): niets doen, wel de hartslag (Beheer → Systeem → Taken blijft groen)
  if (!WEBSHOP_AAN) {
    recordCronRun("cj-bijwerken", true);
    return NextResponse.json({ ok: true, uit: "De webshop staat uit." });
  }
  try {
    const uitslag = await rondeBijwerken();
    recordCronRun("cj-bijwerken", true);
    return NextResponse.json(uitslag);
  } catch (err) {
    recordCronRun("cj-bijwerken", false);
    logger.error("cj-bijwerken mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Ronde mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
