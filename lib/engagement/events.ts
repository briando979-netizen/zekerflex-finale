import type { EngagementKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { localHour } from "@/lib/notifications/timing";

// ---------------------------------------------------------------------------
// Behavioural Timing Notifier v2.
//
// `recordEngagement` timestamps meaningful in-app actions (never throws).
// `computeActiveHours` turns the last ~200 events into the local hours the
// freelancer is genuinely active; `refreshActiveHours` caches that on the
// profile, where the dispatcher reads it (preferring it over manual quiet
// hours). Recomputed by /api/internal/active-hours/recompute.
// ---------------------------------------------------------------------------

const SAMPLE_WINDOW = 200;
const MIN_SAMPLE = 20;

export async function recordEngagement(
  freelancerId: string,
  kind: EngagementKind,
): Promise<void> {
  try {
    await prisma.engagementEvent.create({ data: { freelancerId, kind } });
  } catch (err) {
    logger.warn("engagement event write failed", {
      freelancerId,
      kind,
      error: (err as Error).message,
    });
  }
}

export interface ActiveHours {
  hours: number[];
  sampleSize: number;
}

/** Local hours (0-23) the freelancer is active, or null if too little data. */
export async function computeActiveHours(
  freelancerId: string,
): Promise<ActiveHours | null> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: freelancerId },
    select: { timezone: true },
  });
  if (!profile) return null;

  const events = await prisma.engagementEvent.findMany({
    where: { freelancerId },
    select: { occurredAt: true },
    orderBy: { occurredAt: "desc" },
    take: SAMPLE_WINDOW,
  });
  if (events.length < MIN_SAMPLE) return null;

  const histogram = new Array<number>(24).fill(0);
  for (const e of events) {
    const h = localHour(profile.timezone, e.occurredAt);
    histogram[h] = (histogram[h] ?? 0) + 1;
  }

  const total = events.length;
  // A hour counts as "active" when it holds at least ~40% of the uniform rate
  // (or 2 events, whichever is higher).
  const threshold = Math.max(2, Math.ceil((total / 24) * 0.4));
  const hours = histogram
    .map((count, hour) => ({ count, hour }))
    .filter((h) => h.count >= threshold)
    .map((h) => h.hour);

  // Degenerate result (everything or nothing) -> let the manual window decide.
  if (hours.length === 0 || hours.length >= 22) return null;
  return { hours, sampleSize: total };
}

export async function refreshActiveHours(
  freelancerId: string,
): Promise<ActiveHours | null> {
  const active = await computeActiveHours(freelancerId);
  await prisma.freelancerProfile.update({
    where: { id: freelancerId },
    data: {
      learnedActiveHours: active?.hours ?? [],
      activeHoursComputedAt: new Date(),
    },
  });
  return active;
}

export async function refreshAllActiveHours(): Promise<{
  scanned: number;
  learned: number;
}> {
  // Only profiles with recent engagement are worth recomputing.
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const rows = await prisma.engagementEvent.findMany({
    where: { occurredAt: { gte: since } },
    select: { freelancerId: true },
    distinct: ["freelancerId"],
  });

  let learned = 0;
  for (const { freelancerId } of rows) {
    const active = await refreshActiveHours(freelancerId);
    if (active) learned += 1;
  }
  return { scanned: rows.length, learned };
}
