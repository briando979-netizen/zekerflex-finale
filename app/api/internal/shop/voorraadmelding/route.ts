import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { stuurVoorraadMeldingen } from "@/lib/shop/voorraadmelding-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (elk kwartier): "Laat me weten als hij er weer is" (lib/shop/voorraadmelding.ts). Weer op voorraad → één mail per
// aanvraag en de aanvraag weg; na 90 dagen zonder voorraad weg. Eigen shared-secret auth (x-internal-token).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const uitslag = await stuurVoorraadMeldingen();
    recordCronRun("voorraadmelding", true);
    return NextResponse.json(uitslag);
  } catch (err) {
    recordCronRun("voorraadmelding", false);
    logger.error("voorraadmelding mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Ronde mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
