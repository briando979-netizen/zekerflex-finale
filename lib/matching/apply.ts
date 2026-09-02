import { MatchStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { haversineMeters } from "@/lib/geo/geofencing";
import { recordOfferResponse } from "@/lib/notifications/dispatcher";

// ---------------------------------------------------------------------------
// Marketplace self-apply: a verified freelancer browses OPEN shifts and takes
// one directly. We synthesise the ShiftMatch the dispatcher would normally
// create, then reuse recordOfferResponse so the full downstream flow runs
// (assignment, timesheet, Wet DBA model agreement, shift status).
// ---------------------------------------------------------------------------

const OPEN_STATUSES = ["OPEN", "MATCHING", "PARTIALLY_FILLED"] as const;

export interface ApplyResult {
  status: MatchStatus;
  shiftFilled: boolean;
}

export async function applyToShift(
  userId: string,
  shiftId: string,
): Promise<ApplyResult> {
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
  if (!profile) throw AppError.forbidden("Rond eerst je verificatie af.");
  if (profile.user.kycStatus !== "VERIFIED" || !profile.kvkValid) {
    throw AppError.precondition("Je kunt pas diensten aannemen als je volledig geverifieerd bent.");
  }
  if (profile.isBlacklisted) throw AppError.forbidden("Je account kan momenteel geen diensten aannemen.");
  if (profile.matchingBlockedUntil && profile.matchingBlockedUntil.getTime() > Date.now()) {
    throw AppError.precondition("Matching is tijdelijk beperkt vanwege Wet DBA-signalen.");
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      positions: true,
      branch: { select: { latitude: true, longitude: true, geofenceRadiusMeters: true } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
  });
  if (!shift) throw AppError.notFound("Deze dienst bestaat niet meer.");
  if (!OPEN_STATUSES.includes(shift.status as (typeof OPEN_STATUSES)[number])) {
    throw AppError.conflict("Deze dienst neemt geen aanmeldingen meer aan.");
  }
  if (shift.startsAt.getTime() < Date.now()) throw AppError.conflict("Deze dienst is al begonnen.");
  if (shift._count.assignments >= shift.positions) throw AppError.conflict("Deze dienst is al vol.");

  const already = await prisma.shiftAssignment.findUnique({
    where: { shiftId_freelancerId: { shiftId, freelancerId: profile.id } },
    select: { id: true, cancelledAt: true },
  });
  if (already && !already.cancelledAt) throw AppError.conflict("Je hebt deze dienst al aangenomen.");

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

  return recordOfferResponse(shiftId, profile.id, "ACCEPTED");
}
