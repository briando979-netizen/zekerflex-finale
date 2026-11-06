import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { draaiWinkelAgent } from "@/lib/shop/winkel-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (06:15 UTC): de winkel-agent — inkoopvoorstellen, wekelijks conceptproducten uit trends.
// Eigen shared-secret auth (x-internal-token).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const result = await draaiWinkelAgent();
    recordCronRun("winkel-agent", true);
    return NextResponse.json(result);
  } catch (err) {
    recordCronRun("winkel-agent", false);
    logger.error("winkel-agent mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Ronde mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
