import {
  MatchStatus,
  ShiftStatus,
  type TravelMode,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis, acquireLock } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { sendShiftOffer } from "@/lib/notifications/push";
import { mayPingNow } from "@/lib/notifications/timing";
import { recordEngagement } from "@/lib/engagement/events";
import { ensureModelAgreement } from "@/lib/agreements/model-agreement";

// ---------------------------------------------------------------------------
// Realtime notification dispatcher
//
// The matching engine hands us a score-ranked list of eligible freelancers.
// We push a first wave of FCM offers immediately and stash the remainder in a
// Redis list. A follow-up job (sorted-set, scored by expiry) fires when the
// wave's TTL elapses: it expires the unanswered offers and promotes the next
// wave until the shift is filled or the queue is exhausted.
//
// Keys (all TTL'd to 24h):
//   zf:match:queue:<shiftId>   LIST  - remaining WaveCandidate JSON blobs
//   zf:match:state:<shiftId>   HASH  - { waveSize, offerTtlMinutes, wave, seats }
//   zf:match:followups         ZSET  - member "<shiftId>::<wave>", score = dueAtMs
// ---------------------------------------------------------------------------

export interface WaveCandidate {
  freelancerId: string;
  score: number;
  travelMinutes: number;
  travelMode: TravelMode;
}

interface WaveState {
  waveSize: number;
  offerTtlMinutes: number;
  wave: number;
  seats: number;
}

const MAX_WAVES = 25;
const KEY_TTL_SECONDS = 60 * 60 * 24;
const MATCHABLE: ShiftStatus[] = [
  ShiftStatus.OPEN,
  ShiftStatus.MATCHING,
  ShiftStatus.PARTIALLY_FILLED,
];

const queueKey = (id: string) => `zf:match:queue:${id}`;
const stateKey = (id: string) => `zf:match:state:${id}`;
const FOLLOWUP_ZSET = "zf:match:followups";

// --- helpers ---------------------------------------------------------------

async function readState(shiftId: string): Promise<WaveState | null> {
  const raw = await redis.hgetall(stateKey(shiftId));
  if (!raw || Object.keys(raw).length === 0) return null;
  return {
    waveSize: Number(raw.waveSize ?? "1") || 1,
    offerTtlMinutes: Number(raw.offerTtlMinutes ?? "20") || 20,
    wave: Number(raw.wave ?? "0") || 0,
    seats: Number(raw.seats ?? "0") || 0,
  };
}

async function seatInfo(
  shiftId: string,
): Promise<{ open: number; status: ShiftStatus } | null> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { positions: true, status: true },
  });
  if (!shift) return null;
  const taken = await prisma.shiftAssignment.count({
    where: { shiftId, cancelledAt: null },
  });
  return { open: shift.positions - taken, status: shift.status };
}

async function cleanup(shiftId: string): Promise<void> {
  await redis.del(queueKey(shiftId), stateKey(shiftId));
}

function lpopResult(value: string | string[] | null): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// --- public API -----------------------------------------------------------

/**
 * Seed the queue for a shift and immediately dispatch the first wave.
 * Returns the number of offers actually pushed in wave 1.
 */
export async function enqueueShiftMatching(
  shiftId: string,
  ranked: WaveCandidate[],
  opts: { waveSize: number; offerTtlMinutes: number; seats: number },
): Promise<number> {
  if (opts.seats <= 0 || ranked.length === 0) return 0;

  const pipe = redis.multi();
  pipe.del(queueKey(shiftId));
  pipe.rpush(queueKey(shiftId), ...ranked.map((c) => JSON.stringify(c)));
  pipe.hset(stateKey(shiftId), {
    waveSize: String(Math.max(1, Math.floor(opts.waveSize))),
    offerTtlMinutes: String(Math.max(1, Math.floor(opts.offerTtlMinutes))),
    wave: "0",
    seats: String(opts.seats),
  });
  pipe.expire(queueKey(shiftId), KEY_TTL_SECONDS);
  pipe.expire(stateKey(shiftId), KEY_TTL_SECONDS);
  await pipe.exec();

  return dispatchNextWave(shiftId);
}

/**
 * Pop the next wave off the queue, mark the offers NOTIFIED, send the pushes and
 * schedule the follow-up. Safe to call concurrently - guarded by a Redis lock.
 */
export async function dispatchNextWave(shiftId: string): Promise<number> {
  const unlock = await acquireLock(`match:wave:${shiftId}`, 15_000);
  if (!unlock) return 0;
  const log = logger.child({ shiftId, module: "dispatcher" });

  try {
    const state = await readState(shiftId);
    if (!state) return 0;
    if (state.wave >= MAX_WAVES) {
      await cleanup(shiftId);
      return 0;
    }

    const seats = await seatInfo(shiftId);
    if (!seats || seats.open <= 0 || !MATCHABLE.includes(seats.status)) {
      await cleanup(shiftId);
      return 0;
    }

    // Notify enough people to plausibly fill the remaining seats.
    const takeCount = Math.max(state.waveSize, seats.open);
    const items = lpopResult(
      (await redis.lpop(queueKey(shiftId), takeCount)) as
        | string
        | string[]
        | null,
    );
    if (items.length === 0) {
      await cleanup(shiftId);
      return 0;
    }

    const candidates: WaveCandidate[] = [];
    for (const raw of items) {
      try {
        candidates.push(JSON.parse(raw) as WaveCandidate);
      } catch {
        /* skip a malformed queue entry */
      }
    }

    const [shift, contactWindows] = await Promise.all([
      prisma.shift.findUniqueOrThrow({
        where: { id: shiftId },
        select: {
          title: true,
          hourlyRateCents: true,
          branch: { select: { name: true, city: true } },
        },
      }),
      prisma.freelancerProfile.findMany({
        where: { id: { in: candidates.map((c) => c.freelancerId) } },
        select: {
          id: true,
          timezone: true,
          quietHoursStart: true,
          quietHoursEnd: true,
          learnedActiveHours: true,
        },
      }),
    ]);
    const windowById = new Map(contactWindows.map((w) => [w.id, w]));

    const nextWave = state.wave + 1;
    const expiresAt = new Date(Date.now() + state.offerTtlMinutes * 60_000);
    let dispatched = 0;
    let pushSuppressed = 0;

    for (const cand of candidates) {
      const updated = await prisma.shiftMatch.updateMany({
        where: {
          shiftId,
          freelancerId: cand.freelancerId,
          status: { in: [MatchStatus.SCORED, MatchStatus.NOTIFIED] },
        },
        data: {
          status: MatchStatus.NOTIFIED,
          notifiedAt: new Date(),
          expiresAt,
        },
      });
      if (updated.count === 0) continue; // already responded / assigned

      // The offer is now live in-app either way. Skip only the push ping when
      // the freelancer is inside their local quiet-hours window.
      const w = windowById.get(cand.freelancerId);
      const mayPush =
        !w ||
        mayPingNow({
          timezone: w.timezone,
          quietHoursStart: w.quietHoursStart,
          quietHoursEnd: w.quietHoursEnd,
          learnedActiveHours: w.learnedActiveHours,
        });
      if (!mayPush) {
        pushSuppressed += 1;
        dispatched += 1;
        continue;
      }

      await sendShiftOffer({
        freelancerId: cand.freelancerId,
        shiftId,
        title: `Nieuwe shift: ${shift.title}`,
        body: `${shift.branch.name}, ${shift.branch.city} · €${(
          shift.hourlyRateCents / 100
        ).toFixed(2)}/u · ~${cand.travelMinutes} min reizen`,
        data: {
          score: cand.score.toFixed(3),
          wave: String(nextWave),
          travelMinutes: String(cand.travelMinutes),
          travelMode: cand.travelMode,
          expiresAt: expiresAt.toISOString(),
        },
      });
      dispatched += 1;
    }

    await redis.hset(stateKey(shiftId), {
      wave: String(nextWave),
      seats: String(seats.open),
    });
    await redis.zadd(
      FOLLOWUP_ZSET,
      String(Date.now() + state.offerTtlMinutes * 60_000),
      `${shiftId}::${nextWave}`,
    );

    if (
      dispatched > 0 &&
      seats.status !== ShiftStatus.MATCHING &&
      seats.status !== ShiftStatus.PARTIALLY_FILLED
    ) {
      await prisma.shift.update({
        where: { id: shiftId },
        data: { status: ShiftStatus.MATCHING },
      });
    }

    log.info("wave dispatched", {
      wave: nextWave,
      dispatched,
      pushSuppressed,
      seatsOpen: seats.open,
    });
    return dispatched;
  } finally {
    await unlock();
  }
}

/**
 * Follow-up worker tick. Processes every wave whose TTL has elapsed: expires
 * unanswered offers, then promotes the next wave (or cleans up).
 */
export async function processMatchingFollowups(
  nowMs: number = Date.now(),
): Promise<{ processed: number; redispatched: number; exhausted: number }> {
  const due = (await redis.zrangebyscore(
    FOLLOWUP_ZSET,
    "-inf",
    String(nowMs),
    "LIMIT",
    0,
    100,
  )) as string[];

  let processed = 0;
  let redispatched = 0;
  let exhausted = 0;

  for (const member of due) {
    await redis.zrem(FOLLOWUP_ZSET, member);
    const shiftId = member.split("::")[0];
    if (!shiftId) continue;
    processed += 1;

    await prisma.shiftMatch.updateMany({
      where: {
        shiftId,
        status: MatchStatus.NOTIFIED,
        expiresAt: { lte: new Date() },
      },
      data: { status: MatchStatus.EXPIRED },
    });

    const seats = await seatInfo(shiftId);
    if (!seats || seats.open <= 0 || !MATCHABLE.includes(seats.status)) {
      await cleanup(shiftId);
      continue;
    }

    const remaining = await redis.llen(queueKey(shiftId));
    if (remaining === 0) {
      // Nobody left to try - hand back to manual sourcing.
      await prisma.shift.updateMany({
        where: { id: shiftId, status: ShiftStatus.MATCHING },
        data: { status: ShiftStatus.OPEN },
      });
      await cleanup(shiftId);
      exhausted += 1;
      continue;
    }

    if ((await dispatchNextWave(shiftId)) > 0) redispatched += 1;
  }

  return { processed, redispatched, exhausted };
}

/**
 * Record a freelancer's response to a live offer. ACCEPT creates a seat-checked
 * assignment (+ its draft timesheet); DECLINE frees the slot and opportunistically
 * promotes the next candidate.
 */
export async function recordOfferResponse(
  shiftId: string,
  freelancerId: string,
  decision: "ACCEPTED" | "DECLINED",
): Promise<{ status: MatchStatus; shiftFilled: boolean }> {
  void recordEngagement(freelancerId, "OFFER_RESPONDED");

  if (decision === "DECLINED") {
    await prisma.shiftMatch.updateMany({
      where: {
        shiftId,
        freelancerId,
        status: { in: [MatchStatus.NOTIFIED, MatchStatus.VIEWED] },
      },
      data: { status: MatchStatus.DECLINED, respondedAt: new Date() },
    });
    void dispatchNextWave(shiftId).catch(() => undefined);
    return { status: MatchStatus.DECLINED, shiftFilled: false };
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const match = await tx.shiftMatch.findUnique({
      where: { shiftId_freelancerId: { shiftId, freelancerId } },
    });
    if (
      !match ||
      (match.status !== MatchStatus.NOTIFIED &&
        match.status !== MatchStatus.VIEWED)
    ) {
      throw AppError.conflict("This offer is no longer open");
    }
    if (match.expiresAt && match.expiresAt.getTime() < Date.now()) {
      throw AppError.precondition("This offer has expired");
    }

    const shift = await tx.shift.findUniqueOrThrow({
      where: { id: shiftId },
      include: { branch: { select: { tenantId: true } } },
    });
    const taken = await tx.shiftAssignment.count({
      where: { shiftId, cancelledAt: null },
    });
    if (taken >= shift.positions) {
      throw AppError.conflict("This shift is already fully staffed");
    }

    const assignment = await tx.shiftAssignment.create({
      data: { shiftId, freelancerId, source: MatchStatus.ACCEPTED },
    });
    await tx.shiftMatch.update({
      where: { id: match.id },
      data: { status: MatchStatus.ACCEPTED, respondedAt: new Date() },
    });
    await tx.timesheet.create({
      data: {
        assignmentId: assignment.id,
        freelancerId,
        branchId: shift.branchId,
        scheduledStart: shift.startsAt,
        scheduledEnd: shift.endsAt,
        breakMinutes: shift.breakMinutes,
        hourlyRateCents: shift.hourlyRateCents,
      },
    });

    // Provision the Wet DBA model agreement for this freelancer <-> client pair.
    await ensureModelAgreement(tx, {
      freelancerId,
      tenantId: shift.branch.tenantId,
      branchId: shift.branchId,
      shiftId,
      assignmentId: assignment.id,
      hourlyRateCents: shift.hourlyRateCents,
      scopeDescription: shift.title,
    });

    const filled = taken + 1 >= shift.positions;
    await tx.shift.update({
      where: { id: shiftId },
      data: {
        status: filled ? ShiftStatus.FILLED : ShiftStatus.PARTIALLY_FILLED,
      },
    });
    if (filled) {
      // Withdraw every other live offer for this shift.
      await tx.shiftMatch.updateMany({
        where: {
          shiftId,
          status: { in: [MatchStatus.NOTIFIED, MatchStatus.VIEWED] },
          freelancerId: { not: freelancerId },
        },
        data: { status: MatchStatus.EXPIRED },
      });
    }
    return { filled, open: shift.positions - (taken + 1) };
  });

  if (outcome.filled) {
    await cleanup(shiftId);
  } else {
    await redis
      .hset(stateKey(shiftId), { seats: String(outcome.open) })
      .catch(() => undefined);
  }

  return { status: MatchStatus.ACCEPTED, shiftFilled: outcome.filled };
}
