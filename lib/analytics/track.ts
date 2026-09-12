import { createHash } from "node:crypto";
import { AnalyticsEventType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fixedWindow } from "@/lib/rate-limit";
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
  // fail-open (fixedWindow default) - analytics must never block a page
  const key = `analytics:rate:${Math.floor(Date.now() / 60_000)}:${sessionId}`;
  const gate = await fixedWindow(key, RATE_PER_MIN, 90);
  return gate.ok;
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

/**
 * A server-side conversion event (a whitepaper download, a demo request, …).
 * No session id, no rate limit — these are low-volume and triggered by our own
 * code, not the browser. Never throws; analytics must not break a response.
 */
export async function recordServerEvent(input: {
  path: string;
  label: string;
  type?: AnalyticsEventType;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        type: input.type ?? AnalyticsEventType.CUSTOM,
        path: cleanPath(input.path),
        label: input.label.slice(0, 200),
        sessionId: "server",
        meta: (input.meta ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn("server analytics event failed", { label: input.label, error: (err as Error).message });
  }
}
