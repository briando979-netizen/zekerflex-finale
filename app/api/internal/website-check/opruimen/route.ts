import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { ruimVerlopenSitesOp } from "@/lib/website-check/nieuwe-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elke nacht (deploy/cron/entrypoint.sh): de voorbeeldsites van de gratis
// website-check een week na het verlopen opruimen, met hun foto's op schijf.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    return NextResponse.json(await ruimVerlopenSitesOp());
  } catch (err) {
    recordCronRun("website-check-opruimen", false);
    logger.error("website check cleanup failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Opruimen mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
