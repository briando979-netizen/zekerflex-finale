import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { rondeBijwerken } from "@/lib/shop/cj/bijwerken-ronde";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cron (elke 10 minuten): één ronde "Categorie, voorraad en tekst bijwerken" over de CJ-producten
// (lib/shop/cj/bijwerken-ronde.ts), verder vanaf de cursor, binnen 90 s. Zonder CJ-producten doet hij niets en telt hij
// toch als geslaagd (hartslag).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
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
