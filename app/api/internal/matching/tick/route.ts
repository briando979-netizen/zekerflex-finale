import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { processMatchingFollowups } from "@/lib/notifications/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron entrypoint for the matching follow-up worker. Configure a scheduler
 * (Vercel Cron, GitHub Actions, k8s CronJob) to hit this every 30-60s with the
 * `x-internal-token` header (or `?token=`).
 */
async function handle(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const provided =
    request.headers.get("x-internal-token") ??
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) ??
    new URL(request.url).searchParams.get("token");

  if (env.INTERNAL_CRON_TOKEN) {
    if (provided !== env.INTERNAL_CRON_TOKEN) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Bad internal token" } },
        { status: 401 },
      );
    }
  } else if (env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: {
          code: "PRECONDITION_FAILED",
          message: "INTERNAL_CRON_TOKEN is not configured",
        },
      },
      { status: 412 },
    );
  }

  try {
    const result = await processMatchingFollowups();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("matching tick failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Tick failed" } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
