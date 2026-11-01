import { NextResponse } from "next/server";
import { cronHeartbeats } from "@/lib/ops/heartbeat";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/cron-status — real last-run/success per background job, from the
// durable heartbeat in the KeyValueStore. That one survives restarts and is what the
// separate cron container writes to, unlike the in-process metrics of this server.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ jobs: await cronHeartbeats() });
});
