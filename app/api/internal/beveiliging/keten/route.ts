import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { controleerKeten } from "@/lib/security/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elke nacht (deploy/cron/entrypoint.sh): de hashketen van het auditlogboek
// narekenen (lib/security/intelligence.ts). Een gebroken keten is een melding
// aan de eigenaar, geen mislukte taak: de controle zelf is dan wel gelukt.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const stand = await controleerKeten();
    recordCronRun("beveiliging-keten", true);
    return NextResponse.json(stand);
  } catch (err) {
    recordCronRun("beveiliging-keten", false);
    logger.error("audit chain check failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Check failed" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
