import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { sweepAbuPhaseTransitions } from "@/lib/payroll/abu-phase-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint: detect ABU-fase (A/B/C) transitions for uitzendkrachten,
// notify the freelancer + admin, and record it. Daily is plenty — a phase
// only ever changes once a week's worth of timesheets lands at the earliest.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  try {
    const result = await sweepAbuPhaseTransitions();
    recordCronRun("abu-phase-sweep", true);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    recordCronRun("abu-phase-sweep", false);
    logger.error("abu phase sweep failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Sweep failed" } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
