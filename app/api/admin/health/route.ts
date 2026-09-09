import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { llmHealth } from "@/lib/ai/client";
import { pushChannels } from "@/lib/notifications/push";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/admin/health
//
// Sovereignty dashboard for PLATFORM_ADMIN: are the in-box dependencies
// (Postgres, Redis, the self-hosted LLM) reachable, and which push channels
// are configured. Every check is best-effort and time-boxed.
// ---------------------------------------------------------------------------

async function check(fn: () => Promise<unknown>): Promise<{
  ok: boolean;
  latencyMs: number;
  detail?: string;
}> {
  const started = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      detail: (err as Error).message,
    };
  }
}

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [database, cache, llm] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`),
    check(() => redis.ping()),
    llmHealth(),
  ]);

  const channels = pushChannels();
  const body = {
    checkedAt: new Date().toISOString(),
    database,
    cache,
    llm,
    push: {
      webPush: {
        enabled: channels.webPush,
        note: channels.webPush
          ? "self-hosted (VAPID keypair configured)"
          : "set WEBPUSH_VAPID_* - run `npm run vapid:keys`",
      },
      fcm: {
        enabled: channels.fcm,
        note: channels.fcm
          ? "optional secondary provider active"
          : "not configured (fine - Web Push is primary)",
      },
    },
    sovereign:
      database.ok && cache.ok && llm.ok && channels.webPush,
  };

  return NextResponse.json(body, {
    status: database.ok && cache.ok ? 200 : 503,
  });
});
