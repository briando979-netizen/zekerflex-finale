import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { scanMarkten } from "@/lib/markten/scan";
import { AFWIJZING } from "@/lib/markten/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (06:30 UTC): scant de markten (crypto, goud, olie, tech) en legt hoogstens drie voorstellen klaar.
// Eigen shared-secret auth (x-internal-token).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const result = (await scanMarkten(), { ok: true, afwijzing: AFWIJZING });
    recordCronRun("markten-scan", true);
    return NextResponse.json(result);
  } catch (err) {
    recordCronRun("markten-scan", false);
    logger.error("markten-scan mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Ronde mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
