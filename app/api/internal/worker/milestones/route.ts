import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { sweepMilestoneReminders } from "@/lib/worker/milestone-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Dagelijkse administratie-herinneringen (btw-deadline, urencriterium, KOR).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const result = await sweepMilestoneReminders();
    recordCronRun("worker-milestones", true);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    recordCronRun("worker-milestones", false);
    logger.error("milestone sweep failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Sweep failed" } }, { status: 500 });
  }
}

export const GET = handle;
