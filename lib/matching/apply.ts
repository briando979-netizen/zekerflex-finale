import { eisOnboardingVoorReageren } from "@/lib/onboarding/werker-poort-server";
import { isTenantVerified } from "@/lib/company/verified";
import { MatchStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { haversineMeters } from "@/lib/geo/geofencing";
import { recordOfferResponse } from "@/lib/notifications/dispatcher";
import { isBlockedByAny } from "@/lib/employer/relations";
import { payoutEligibility } from "@/lib/fiscal/eligibility";
import { isInvitedToPoolOnlyShift } from "@/lib/pools/store";
import { findOverlappingShift, overlapMessageSelf, overlapParams } from "@/lib/shifts/worker-overlap";

// ---------------------------------------------------------------------------
// Marketplace self-apply: a verified freelancer browses OPEN shifts and takes
// one directly. We synthesise the ShiftMatch the dispatcher would normally
// create, then reuse recordOfferResponse so the full downstream flow runs
// (assignment, timesheet, Wet DBA model agreement, shift status).
// ---------------------------------------------------------------------------

const OPEN_STATUSES = ["OPEN", "MATCHING", "PARTIALLY_FILLED"] as const;

/** How long after a shift's real start time a late direct acceptance is still allowed (e.g. a no-show backfill). Mirrors app/dashboard/klussen/actions.ts's counter-offer path. */
const LATE_ACCEPT_GRACE_MS = 2 * 60 * 60 * 1000;

export interface ApplyResult {
  status: MatchStatus;
  shiftFilled: boolean;
  /** the company isn't verified yet: the reaction is noted, nobody is scheduled */
  pendingCompanyVerification?: boolean;
}

export async function applyToShift(
  userId: string,
  shiftId: string,
): Promise<ApplyResult> {
  // eerst de onboarding (12 nov, eigenaar: alles zien, alleen reageren wacht op de onboarding)
  await eisOnboardingVoorReageren(userId);
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      kvkValid: true,
      isBlacklisted: true,
      matchingBlockedUntil: true,
      homeLatitude: true,
      homeLongitude: true,
      user: { select: { kycStatus: true } },
    },
  });
  if (!profile) throw AppError.forbidden("Rond eerst je verificatie af.").metSleutel("apply.verificatie");
  if (profile.user.kycStatus !== "VERIFIED") {
    throw AppError.precondition("Je kunt pas diensten aannemen als je identiteit is geverifieerd.").metSleutel("apply.identiteit");
  }
  const eligible = await payoutEligibility(userId);
  if (!eligible.ok) {
    const fout = AppError.precondition(eligible.reason ?? "Je kunt nog geen diensten aannemen.");
    // een eigen reden zonder sleutel (bv. het recht om te werken) blijft Nederlands; de algemene melding krijgt de sleutel
    const sleutel = eligible.reason ? eligible.sleutel : "apply.nietKlaar";
    throw sleutel ? fout.metSleutel(sleutel) : fout;
  }
  if (profile.isBlacklisted) throw AppError.forbidden("Je account kan momenteel geen diensten aannemen.").metSleutel("apply.geblokkeerd");
  if (profile.matchingBlockedUntil && profile.matchingBlockedUntil.getTime() > Date.now()) {
    throw AppError.precondition("Matching is tijdelijk beperkt vanwege Wet DBA-signalen.").metSleutel("apply.dba");
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      positions: true,
      viaUitzendbureau: true,
      visibility: true,
      branch: { select: { tenantId: true, latitude: true, longitude: true, geofenceRadiusMeters: true } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
  });
  if (!shift) throw AppError.notFound("Deze dienst bestaat niet meer.").metSleutel("apply.bestaatNiet");
  if (shift.viaUitzendbureau && eligible.track !== "payroll") {
    throw AppError.forbidden("Deze klus is alleen voor uitzendkrachten via het ZekerFlex-uitzendbureau.").metSleutel("apply.uitzendOnly");
  }
  if (await isBlockedByAny([shift.branch.tenantId], userId)) {
    throw AppError.forbidden("Deze opdrachtgever neemt op dit moment geen aanmeldingen van je aan.").metSleutel("apply.opdrachtgeverWeigert");
  }
  if (shift.visibility === "POOL_ONLY" && !(await isInvitedToPoolOnlyShift(shiftId, userId))) {
    throw AppError.forbidden("Deze dienst is nog niet open voor aanmeldingen.").metSleutel("apply.nietOpen");
  }
  if (!OPEN_STATUSES.includes(shift.status as (typeof OPEN_STATUSES)[number])) {
    throw AppError.conflict("Deze dienst neemt geen aanmeldingen meer aan.").metSleutel("apply.geenAanmeldingen");
  }
  if (shift.startsAt.getTime() + LATE_ACCEPT_GRACE_MS < Date.now()) {
    throw AppError.conflict("Deze dienst is al meer dan 2 uur geleden begonnen — aanmelden kan niet meer.").metSleutel("apply.begonnen");
  }
  if (shift._count.assignments >= shift.positions) throw AppError.conflict("Deze dienst is al vol.").metSleutel("apply.vol");

  const already = await prisma.shiftAssignment.findUnique({
    where: { shiftId_freelancerId: { shiftId, freelancerId: profile.id } },
    select: { id: true, cancelledAt: true },
  });
  if (already && !already.cancelledAt) throw AppError.conflict("Je hebt deze dienst al aangenomen.").metSleutel("apply.alAangenomen");
  // Eerst hier (vóór de reactie wordt vastgelegd); recordOfferResponse controleert nog eens binnen de transactie.
  const overlap = await findOverlappingShift(prisma, profile.id, { shiftId, startsAt: shift.startsAt, endsAt: shift.endsAt });
  if (overlap) throw AppError.conflict(overlapMessageSelf(overlap)).metSleutel("apply.overlap", overlapParams(overlap));

  const distanceMeters = Math.round(
    haversineMeters(
      { latitude: profile.homeLatitude, longitude: profile.homeLongitude },
      { latitude: shift.branch.latitude, longitude: shift.branch.longitude },
    ),
  );
  // Rough door-to-door estimate: ~22 km/h average incl. stops.
  const travelMinutes = Math.max(1, Math.round((distanceMeters / 1000 / 22) * 60));
  const withinGeofence = distanceMeters <= shift.branch.geofenceRadiusMeters;

  const breakdown = {
    source: "marketplace-self-apply",
    travelMinutes,
    distanceMeters,
  } satisfies Prisma.InputJsonValue;

  await prisma.shiftMatch.upsert({
    where: { shiftId_freelancerId: { shiftId, freelancerId: profile.id } },
    create: {
      shiftId,
      freelancerId: profile.id,
      score: 0.75,
      scoreBreakdown: breakdown,
      travelMode: "TRANSIT",
      travelMinutes,
      distanceMeters,
      withinGeofence,
      status: MatchStatus.NOTIFIED,
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
    update: {
      status: MatchStatus.NOTIFIED,
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  if (!(await isTenantVerified(shift.branch.tenantId))) {
    // Test klus of a not-yet-verified company: keep the reaction (VIEWED =
    // interested, no expiry) so the company sees it, but schedule nobody.
    await prisma.shiftMatch.update({
      where: { shiftId_freelancerId: { shiftId, freelancerId: profile.id } },
      data: { status: MatchStatus.VIEWED, expiresAt: null },
    });
    return { status: MatchStatus.VIEWED, shiftFilled: false, pendingCompanyVerification: true };
  }

  return recordOfferResponse(shiftId, profile.id, "ACCEPTED");
}
