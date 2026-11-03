import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { sweepMilestoneReminders } from "@/lib/worker/milestone-push";
import { syncWorkerStats } from "@/lib/worker/stats-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Dagelijkse werker-taak: administratie-herinneringen (btw-deadline,
// urencriterium, KOR) en de profielcijfers bijwerken (lib/worker/stats-sync).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  // Los van de herinneringen: een fout in de één houdt de ander niet tegen.
  let stats: Awaited<ReturnType<typeof syncWorkerStats>> | { error: string };
  try {
    stats = await syncWorkerStats();
    recordCronRun("worker-stats", true);
  } catch (err) {
    recordCronRun("worker-stats", false);
    logger.error("worker stats sync failed", { error: (err as Error).message });
    stats = { error: "Stats sync failed" };
  }
  try {
    const result = await sweepMilestoneReminders();
    recordCronRun("worker-milestones", true);
    return NextResponse.json({ ok: true, ...result, stats });
  } catch (err) {
    recordCronRun("worker-milestones", false);
    logger.error("milestone sweep failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Sweep failed" }, stats }, { status: 500 });
  }
}

export const GET = handle;
