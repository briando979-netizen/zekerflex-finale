import { NextResponse } from "next/server";
import { cronStatusSnapshot } from "@/lib/metrics";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirrors the job list scripts/daemon.mjs actually drives — keep in sync by
// hand; there's no single source of truth to derive this from automatically
// since daemon.mjs is a plain script, not an importable module.
const JOBS = [
  "ai-watchdog",
  "matching-tick",
  "active-hours",
  "sales-motor",
  "orchestration",
  "rag-reindex",
  "retention-sweep",
  "abu-phase-sweep",
  "no-show-sweep",
  "claim-collections-sweep",
] as const;

// GET /api/admin/cron-status — real last-run/success per background job, read
// straight from the in-process Prometheus registry (lib/metrics). Only
// reflects runs that happened in THIS server process since boot — a fresh
// deploy shows everything as "nog niet gedraaid" until the daemon's first
// tick, which is accurate, not a bug.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ jobs: await cronStatusSnapshot(JOBS) });
});
