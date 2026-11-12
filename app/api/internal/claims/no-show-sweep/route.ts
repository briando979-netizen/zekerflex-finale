import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { sweepNoShows } from "@/lib/claims/no-show-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint: detect no-shows (shift started > grace period ago, never
// cancelled, never checked in), offer the employer a 50% claim, dent
// reliability. Staat NIET in de cron (keuze eigenaar, lib/claims/no-show-sweep.ts). ?droog=1 telt alleen.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  try {
    const droog = new URL(request.url).searchParams.get("droog") === "1";
    const result = await sweepNoShows({ droog });
    // een droge telling is geen run van de taak
    if (droog) return NextResponse.json({ ok: true, ...result });
    recordCronRun("no-show-sweep", true);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    recordCronRun("no-show-sweep", false);
    logger.error("no-show sweep failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Sweep failed" } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
