import { isTenantVerified } from "@/lib/company/verified";
import {
  MatchStatus,
  ShiftStatus,
  type BadgeLevel,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { acquireLock } from "@/lib/redis";
import { isMatchEligibleWorker } from "@/lib/matching/geschikt";
import { estimateTravel, fastestMode } from "@/lib/geo/travel-time";
import { enqueueShiftMatching } from "@/lib/notifications/dispatcher";
import { assertFreelancerMatchable } from "@/lib/compliance/dba";
import { eisWerkrecht } from "@/lib/werkrecht/store";
import { ensureModelAgreement } from "@/lib/agreements/model-agreement";
import { lockShiftSeats } from "@/lib/shifts/seat-lock";
import { findOverlappingShift } from "@/lib/shifts/worker-overlap";
import { loadWorkerPrefs, prefsAllowShift, prefsAllowTravel, type WorkerPrefs } from "@/lib/matching/worker-prefs";
import { dispatchWebhook } from "@/lib/webhooks/dispatcher";
import { invitedPoolMemberUserIds } from "@/lib/pools/store";
import { isTestklus } from "@/lib/shifts/testklus";
import { testklusOntvangers } from "@/lib/shifts/testklus-db";
import { zonderTestwerker } from "@/lib/testwerker/adres";
import {
  resolveMatchingConfig,
  scoreCandidateSignals,
  skillScore,
  travelScore,
  type ShiftScoringContext,
} from "@/lib/matching/score";
import type {
  GeoPoint,
  MatchCandidate,
  MatchingResult,
  ResolvedMatchingConfig,
  TravelEstimate,
} from "@/types/matching";

// ---------------------------------------------------------------------------
// Dynamic Smart Matching Engine
//
// For an OPEN shift, score every plausible freelancer on a weighted blend of
//   - reliability   behavioural score (no-shows, punctuality, cancellations)
//   - travel        door-to-door time, multi-modal, schedule-aware
//   - skill         verified rating for the required skill
// then either auto-assign the top candidates (when the branch enables it and a
// candidate clears every auto-accept gate) or push a time-boxed offer in
// score-ranked waves.
//
// Pure scoring math lives in `lib/matching/score.ts`; this module orchestrates
// data loading, travel-time lookups, persistence and notifications.
// ---------------------------------------------------------------------------

export {
  resolveMatchingConfig,
  travelScore,
  skillScore,
} from "@/lib/matching/score";

export interface CandidateInput {
  freelancerId: string;
  userId: string;
  home: GeoPoint;
  reliabilityScore: number;
  acceptanceScore: number;
  skillRating: number | null;
  badgeLevel: BadgeLevel;
}

export interface ScoredCandidate extends MatchCandidate {
  acceptanceScore: number;
  reliabilityScore: number;
}

async function scoreCandidate(
  candidate: CandidateInput,
  shift: ShiftScoringContext & { startsAt: Date },
  config: ResolvedMatchingConfig,
): Promise<ScoredCandidate> {
  const estimates: TravelEstimate[] = await estimateTravel(
    candidate.home,
    shift.location,
    config.travelModes,
    shift.startsAt,
  );
  const travel = fastestMode(estimates);

  const result = scoreCandidateSignals(
    {
      home: candidate.home,
      reliabilityScore: candidate.reliabilityScore,
      acceptanceScore: candidate.acceptanceScore,
      skillRating: candidate.skillRating,
      badgeLevel: candidate.badgeLevel,
      travel,
    },
    shift,
    config,
  );

  return {
    freelancerId: candidate.freelancerId,
    userId: candidate.userId,
    score: result.score,
    breakdown: result.breakdown,
    travel,
    withinGeofence: result.withinGeofence,
    eligible: result.eligible,
    ...(result.ineligibleReason
      ? { ineligibleReason: result.ineligibleReason }
      : {}),
    acceptanceScore: Math.min(1, Math.max(0, candidate.acceptanceScore)),
    reliabilityScore: result.breakdown.reliability,
  };
}

// De regel "mag deze werker deze klus doen?" staat in lib/matching/geschikt.ts
// (ook gebruikt bij het overnemen van een klus); hier doorgegeven voor wie hem
// al uit de matching haalde.
export { isMatchEligibleWorker };

async function loadCandidatePool(shift: {
  id: string;
  requiredSkillId: string | null;
  startsAt: Date;
  endsAt: Date;
  viaUitzendbureau: boolean;
  restrictToUserIds?: string[] | null;
}): Promise<CandidateInput[]> {
  const now = new Date();
  const profiles = await prisma.freelancerProfile.findMany({
    where: {
      isBlacklisted: false,
      // het testwerkeraccount van de eigenaar krijgt geen voorstellen (lib/testwerker/adres.ts)
      user: { kycStatus: "VERIFIED", disabledAt: null, ...zonderTestwerker() },
      OR: [
        { matchingBlockedUntil: null },
        { matchingBlockedUntil: { lte: now } },
      ],
      assignments: {
        none: {
          cancelledAt: null,
          shift: {
            startsAt: { lt: shift.endsAt },
            endsAt: { gt: shift.startsAt },
          },
        },
      },
      matches: { none: { shiftId: shift.id } },
      ...(shift.requiredSkillId
        ? { skills: { some: { skillId: shift.requiredSkillId } } }
        : {}),
      ...(shift.restrictToUserIds ? { userId: { in: shift.restrictToUserIds } } : {}),
    },
    select: {
      id: true,
      userId: true,
      homeLatitude: true,
      homeLongitude: true,
      reliabilityScore: true,
      acceptanceScore: true,
      badgeLevel: true,
      vatValid: true,
      kvkValid: true,
      country: true,
      skills: shift.requiredSkillId
        ? {
            where: { skillId: shift.requiredSkillId },
            select: { rating: true },
          }
        : false,
    },
    take: 500,
  });

  const checks = await Promise.all(
    profiles.map((p) => isMatchEligibleWorker(p, shift.viaUitzendbureau)),
  );
  const eligible = profiles.filter((_, i) => checks[i]);

  return eligible.map((p) => {
    const skills = p.skills as { rating: number }[] | false;
    return {
      freelancerId: p.id,
      userId: p.userId,
      home: { latitude: p.homeLatitude, longitude: p.homeLongitude },
      reliabilityScore: p.reliabilityScore,
      acceptanceScore: p.acceptanceScore,
      badgeLevel: p.badgeLevel,
      skillRating: Array.isArray(skills) && skills[0] ? skills[0].rating : null,
    };
  });
}

const MATCHABLE_STATUSES: ShiftStatus[] = [
  ShiftStatus.OPEN,
  ShiftStatus.MATCHING,
  ShiftStatus.PARTIALLY_FILLED,
];

/**
 * Run matching for a single shift. Only creates matches for freelancers that do
 * not yet have one, and stops once the shift is filled. Guarded by a Redis lock
 * so two workers cannot double-fill the same shift.
 */
export async function runMatchingForShift(
  shiftId: string,
): Promise<MatchingResult> {
  const unlock = await acquireLock(`match:shift:${shiftId}`, 30_000);
  if (!unlock) {
    throw AppError.conflict("Matching is already running for this shift");
  }
  const log = logger.child({ shiftId, module: "matching-engine" });

  try {
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        branch: { include: { tenant: { select: { name: true } } } },
        requiredSkill: { select: { name: true } },
        assignments: { where: { cancelledAt: null }, select: { id: true } },
      },
    });
    if (!shift) throw AppError.notFound("Dienst niet gevonden.");
    if (!MATCHABLE_STATUSES.includes(shift.status)) {
      throw AppError.precondition(
        `Shift is not matchable (status ${shift.status})`,
      );
    }

    const seatsRemaining = shift.positions - shift.assignments.length;
    if (seatsRemaining <= 0) return emptyResult(shiftId, 0);

    const config = resolveMatchingConfig(shift.branch.matchingConfig);
    const scoringContext: ShiftScoringContext & { startsAt: Date } = {
      location: {
        latitude: shift.branch.latitude,
        longitude: shift.branch.longitude,
      },
      minSkillRating: shift.minSkillRating,
      branchGeofenceRadiusMeters: shift.branch.geofenceRadiusMeters,
      startsAt: shift.startsAt,
    };

    // A privately pool-invited shift only ever matches/notifies the invited
    // pool's members — never the full platform-wide candidate pool — until
    // the employer explicitly publishes it (publishShiftAction flips
    // visibility back to PUBLIC and re-runs matching unrestricted).
    let restrictToUserIds =
      shift.visibility === "POOL_ONLY" ? await invitedPoolMemberUserIds(shift.id) : null;
    // Een testklus nooit als voorstel (of automatisch ingepland) naar echte
    // werkers, alleen naar interne accounts (lib/shifts/testklus-db.ts).
    if (isTestklus({ title: shift.title, bedrijf: shift.branch.tenant.name })) {
      const intern = new Set((await testklusOntvangers(shift.branch.tenantId)).map((o) => o.userId));
      restrictToUserIds = (restrictToUserIds ?? [...intern]).filter((id) => intern.has(id));
    }

    const loaded = await loadCandidatePool({
      id: shift.id,
      requiredSkillId: shift.requiredSkillId,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      restrictToUserIds,
      viaUitzendbureau: shift.viaUitzendbureau,
    });
    // The worker's own settings (min rate, available dayparts, max travel): no offer outside them.
    const prefsByUser = await loadWorkerPrefs(loaded.map((c) => c.userId)).catch(() => new Map<string, Partial<WorkerPrefs>>());
    const shiftVoorPrefs = { startsAt: shift.startsAt, hourlyRateCents: shift.hourlyRateCents, title: shift.title, skill: shift.requiredSkill?.name ?? null };
    const pool = loaded.filter((c) => prefsAllowShift(prefsByUser.get(c.userId), shiftVoorPrefs));
    log.info("candidate pool loaded", { size: pool.length, outsidePrefs: loaded.length - pool.length });

    const scored = await Promise.all(
      pool.map((c) => scoreCandidate(c, scoringContext, config)),
    );

    if (scored.length > 0) {
      await prisma.shiftMatch.createMany({
        data: scored.map((c) => ({
          shiftId,
          freelancerId: c.freelancerId,
          score: c.score,
          scoreBreakdown: c.breakdown as unknown as Prisma.InputJsonValue,
          travelMode: c.travel.mode,
          travelMinutes: c.travel.durationMinutes,
          distanceMeters: c.travel.distanceMeters,
          withinGeofence: c.withinGeofence,
          status: MatchStatus.SCORED,
        })),
        skipDuplicates: true,
      });
    }

    const ranked = scored
      .filter((c) => c.eligible && prefsAllowTravel(prefsByUser.get(c.userId), c.travel.durationMinutes))
      .sort((a, b) => b.score - a.score);

    // ---- Auto-assignment -------------------------------------------------
    const autoAssignedIds = new Set<string>();
    const aa = config.autoAcceptance;
    // never auto-schedule anyone on a not-yet-verified company's test klus
    if (aa?.enabled && (await isTenantVerified(shift.branch.tenantId))) {
      const limit = Math.min(seatsRemaining, aa.maxSeatsToAutoFill);
      for (const c of ranked) {
        if (autoAssignedIds.size >= limit) break;
        if (c.score < aa.minScore) continue;
        if (c.acceptanceScore < aa.minAcceptanceScore) continue;
        if (c.reliabilityScore < aa.minReliabilityScore) continue;
        if (aa.requireWithinGeofence && !c.withinGeofence) continue;

        try {
          await assertFreelancerMatchable(c.freelancerId);
          // niet automatisch inplannen zonder recht om te werken (lib/werkrecht): dan overslaan
          await eisWerkrecht(c.userId, { voorWerkgever: true });
          await autoAssign(shift, c.freelancerId);
          autoAssignedIds.add(c.freelancerId);
          log.info("auto-assigned", {
            freelancerId: c.freelancerId,
            score: Number(c.score.toFixed(3)),
          });
        } catch (err) {
          log.warn("auto-assign skipped", {
            freelancerId: c.freelancerId,
            reason: (err as Error).message,
          });
        }
      }
    }

    // ---- Notification waves (delegated to the realtime dispatcher) -----
    const seatsAfterAuto = seatsRemaining - autoAssignedIds.size;
    let notified = 0;
    if (seatsAfterAuto > 0) {
      const waveQueue = ranked
        .filter((c) => !autoAssignedIds.has(c.freelancerId))
        .map((c) => ({
          freelancerId: c.freelancerId,
          score: c.score,
          travelMinutes: c.travel.durationMinutes,
          travelMode: c.travel.mode,
        }));
      notified = await enqueueShiftMatching(shift.id, waveQueue, {
        waveSize: config.notificationWaveSize ?? waveQueue.length,
        offerTtlMinutes: config.offerTtlMinutes,
        seats: seatsAfterAuto,
      });
    }

    const seatsLeft = Math.max(0, seatsRemaining - autoAssignedIds.size);
    if (autoAssignedIds.size > 0 && seatsLeft === 0) {
      await prisma.shift.update({
        where: { id: shiftId },
        data: { status: ShiftStatus.FILLED },
      });
    }

    return {
      shiftId,
      evaluated: scored.length,
      eligible: ranked.length,
      notified,
      autoAssigned: autoAssignedIds.size,
      seatsRemaining: seatsLeft,
      candidates: ranked.slice(0, 25),
    };
  } finally {
    await unlock();
  }
}

type ShiftWithBranch = Prisma.ShiftGetPayload<{ include: { branch: true } }>;

async function autoAssign(
  shift: ShiftWithBranch,
  freelancerId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Serialise against every other seat-taker for this shift (see seat-lock.ts).
    // The Redis match lock only guards matching runs against each other, not
    // against a freelancer accepting an offer at the same moment.
    await lockShiftSeats(tx, shift.id);

    const taken = await tx.shiftAssignment.count({
      where: { shiftId: shift.id, cancelledAt: null },
    });
    if (taken >= shift.positions) {
      throw AppError.conflict("De dienst was al vol voordat de automatische toewijzing rond was.");
    }
    // The candidate pool skips busy workers, but they may have taken another shift since.
    const overlap = await findOverlappingShift(tx, freelancerId, { shiftId: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt });
    if (overlap) throw AppError.conflict("De kracht nam intussen een overlappende dienst aan.");

    const assignment = await tx.shiftAssignment.create({
      data: {
        shiftId: shift.id,
        freelancerId,
        source: MatchStatus.AUTO_ASSIGNED,
      },
    });
    await tx.shiftMatch.update({
      where: { shiftId_freelancerId: { shiftId: shift.id, freelancerId } },
      data: { status: MatchStatus.AUTO_ASSIGNED, respondedAt: new Date() },
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

    await ensureModelAgreement(tx, {
      freelancerId,
      tenantId: shift.branch.tenantId,
      branchId: shift.branchId,
      shiftId: shift.id,
      assignmentId: assignment.id,
      hourlyRateCents: shift.hourlyRateCents,
      scopeDescription: shift.title,
    });
  });
  void dispatchWebhook("shift.matched", shift.branch.tenantId, {
    shiftId: shift.id,
    freelancerId,
    source: "AUTO_ASSIGNED",
  }).catch(() => undefined);
}

function emptyResult(shiftId: string, evaluated: number): MatchingResult {
  return {
    shiftId,
    evaluated,
    eligible: 0,
    notified: 0,
    autoAssigned: 0,
    seatsRemaining: 0,
    candidates: [],
  };
}
