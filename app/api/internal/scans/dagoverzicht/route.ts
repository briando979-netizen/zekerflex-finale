import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { stuurScanDagoverzicht } from "@/lib/scans/dagoverzicht";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (07:00 UTC): het dagoverzicht van de gratis scans aan sales@ — nieuwe
// scans, akkoorden en wie nog op opvolging wacht. Geen mail als er niets gebeurde.
// Eigen shared-secret auth (x-internal-token).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const result = await stuurScanDagoverzicht();
    recordCronRun("scan-dagoverzicht", true);
    return NextResponse.json(result);
  } catch (err) {
    recordCronRun("scan-dagoverzicht", false);
    logger.error("scan-dagoverzicht mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Dagoverzicht mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
