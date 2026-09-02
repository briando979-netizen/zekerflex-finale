import { createHash } from "node:crypto";
import { AnalyticsEventType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Sovereign analytics ingestion. Local-only: no cookies, no third-party.
// ---------------------------------------------------------------------------

const MAX_BATCH = 20;
const RATE_PER_MIN = 240; // per session id

export interface RawEvent {
  type: AnalyticsEventType;
  path: string;
  label?: string | undefined;
  referrer?: string | undefined;
  meta?: Record<string, unknown> | undefined;
}

export interface TrackContext {
  sessionId: string;
  userId?: string | null;
  userAgent?: string | null;
}

function referrerHost(ref: string | undefined): string | null {
  if (!ref) return null;
  try {
    return new URL(ref).hostname || null;
  } catch {
    return null;
  }
}

function cleanPath(path: string): string {
  const p = path.trim().slice(0, 512);
  return p.startsWith("/") ? p : `/${p}`;
}

async function withinRate(sessionId: string): Promise<boolean> {
  try {
    const key = `analytics:rate:${Math.floor(Date.now() / 60_000)}:${sessionId}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 90);
    return n <= RATE_PER_MIN;
  } catch {
    return true; // fail-open - analytics must never block a page
  }
}

export async function trackEvents(
  events: RawEvent[],
  ctx: TrackContext,
): Promise<{ accepted: number }> {
  if (!ctx.sessionId || events.length === 0) return { accepted: 0 };
  if (!(await withinRate(ctx.sessionId))) return { accepted: 0 };

  const uaHash = ctx.userAgent
    ? createHash("sha256").update(ctx.userAgent).digest("hex").slice(0, 16)
    : null;

  const rows: Prisma.AnalyticsEventCreateManyInput[] = events
    .slice(0, MAX_BATCH)
    .filter((e) => e.path)
    .map((e) => ({
      type: e.type,
      path: cleanPath(e.path),
      label: e.label?.slice(0, 200) ?? null,
      referrerHost: referrerHost(e.referrer),
      sessionId: ctx.sessionId.slice(0, 64),
      userId: ctx.userId ?? null,
      uaHash,
      meta: (e.meta ?? {}) as Prisma.InputJsonValue,
    }));

  if (rows.length === 0) return { accepted: 0 };

  try {
    await prisma.analyticsEvent.createMany({ data: rows });
  } catch (err) {
    logger.warn("analytics write failed", { error: (err as Error).message });
    return { accepted: 0 };
  }
  return { accepted: rows.length };
}
