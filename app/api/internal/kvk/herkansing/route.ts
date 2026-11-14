import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { bewaarHerkansingMeting, kvkHerkansing } from "@/lib/kvk/herkansing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (elke 30 min): KVK-controles die wachtten omdat het tegoed bij KVKBase op was of de minuutlimiet bereikt, opnieuw
// doen (lib/kvk/herkansing.ts). Eigen shared-secret auth.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const uitslag = await kvkHerkansing();
    // de stand voor Beheer en het ochtendbericht (meting:kvk-herkansing), alleen aantallen
    await bewaarHerkansingMeting(uitslag);
    recordCronRun("kvk-herkansing", true);
    return NextResponse.json(uitslag);
  } catch (err) {
    recordCronRun("kvk-herkansing", false);
    logger.error("kvk-herkansing mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Herkansing mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
