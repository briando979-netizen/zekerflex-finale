import { DisputeOrigin, GpsEventType, TimesheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { recordEngagement } from "@/lib/engagement/events";
import { evaluateGeofence } from "@/lib/geo/geofencing";

// ---------------------------------------------------------------------------
// GPS check-in / heartbeat / check-out ingestion.
//
// Produces the `GpsEvent` trail the dispute console and the timesheet-approval
// route rely on: every event is geofenced against the branch centroid at the
// moment it is recorded, so validity is frozen in the data rather than
// recomputed later from possibly-changed branch coordinates.
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000;
const MAX_CLOCK_SKEW_MS = 6 * 60 * MINUTE_MS;

export interface RecordGpsEventInput {
  timesheetId: string;
  freelancerProfileId: string;
  type: GpsEventType;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  deviceHash: string;
  mocked?: boolean;
  /** Client timestamp; ignored when it drifts more than 6h from the server clock. */
  recordedAt?: Date;
}

export interface RecordGpsEventResult {
  eventId: string;
  type: GpsEventType;
  recordedAt: string;
  distanceToBranchMeters: number;
  withinGeofence: boolean;
  mocked: boolean;
  actualStart: string | null;
  actualEnd: string | null;
  billableMinutes: number;
  /** Set when this event opened (or updated) an automatic dispute. */
  disputeRaised: DisputeOrigin | null;
}

/** Only CHECK_IN / CHECK_OUT positions are hard enough to auto-dispute on. */
const ANCHOR_EVENTS: GpsEventType[] = [
  GpsEventType.CHECK_IN,
  GpsEventType.CHECK_OUT,
];

function label(type: GpsEventType): string {
  return type === GpsEventType.CHECK_IN
    ? "check-in"
    : type === GpsEventType.CHECK_OUT
      ? "check-out"
      : "locatie-ping";
}

function resolveRecordedAt(client: Date | undefined): Date {
  const now = new Date();
  if (!client) return now;
  return Math.abs(now.getTime() - client.getTime()) > MAX_CLOCK_SKEW_MS
    ? now
    : client;
}

export async function recordGpsEvent(
  input: RecordGpsEventInput,
): Promise<RecordGpsEventResult> {
  const log = logger.child({
    module: "timesheet-checkin",
    timesheetId: input.timesheetId,
  });

  const ts = await prisma.timesheet.findUnique({
    where: { id: input.timesheetId },
    include: {
      branch: {
        select: {
          latitude: true,
          longitude: true,
          geofenceRadiusMeters: true,
        },
      },
      freelancer: { select: { userId: true } },
      gpsEvents: { select: { type: true } },
      dispute: { select: { id: true } },
    },
  });
  if (!ts) throw AppError.notFound("Timesheet not found");
  if (ts.freelancerId !== input.freelancerProfileId) {
    throw AppError.forbidden("This timesheet belongs to another freelancer");
  }
  if (ts.status !== TimesheetStatus.DRAFT) {
    throw AppError.precondition(
      `GPS events can only be recorded while the timesheet is a draft (status ${ts.status})`,
    );
  }

  const hasCheckIn = ts.gpsEvents.some((e) => e.type === GpsEventType.CHECK_IN);
  const hasCheckOut = ts.gpsEvents.some(
    (e) => e.type === GpsEventType.CHECK_OUT,
  );

  if (input.type === GpsEventType.CHECK_IN && hasCheckIn) {
    throw AppError.conflict("Already checked in for this shift");
  }
  if (input.type !== GpsEventType.CHECK_IN && !hasCheckIn) {
    throw AppError.precondition("Check in before sending heartbeats or checking out");
  }
  if (input.type === GpsEventType.CHECK_OUT && hasCheckOut) {
    throw AppError.conflict("Already checked out for this shift");
  }

  const recordedAt = resolveRecordedAt(input.recordedAt);
  const geo = evaluateGeofence(
    { latitude: input.latitude, longitude: input.longitude },
    { latitude: ts.branch.latitude, longitude: ts.branch.longitude },
    ts.branch.geofenceRadiusMeters,
    input.accuracyMeters,
  );

  const mocked = input.mocked ?? false;
  const scheduledMinutes = Math.max(
    0,
    Math.round(
      (ts.scheduledEnd.getTime() - ts.scheduledStart.getTime()) / MINUTE_MS,
    ) - ts.breakMinutes,
  );

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.gpsEvent.create({
      data: {
        timesheetId: ts.id,
        type: input.type,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters,
        recordedAt,
        distanceToBranchMeters: geo.distanceMeters,
        withinGeofence: geo.withinGeofence,
        deviceHash: input.deviceHash,
        mocked,
      },
    });

    let actualStart = ts.actualStart;
    let actualEnd = ts.actualEnd;
    let billableMinutes = ts.billableMinutes;

    if (input.type === GpsEventType.CHECK_IN) {
      actualStart = recordedAt;
      await tx.timesheet.update({
        where: { id: ts.id },
        data: { actualStart: recordedAt },
      });
    } else if (input.type === GpsEventType.CHECK_OUT) {
      actualEnd = recordedAt;
      const start = ts.actualStart ?? ts.scheduledStart;
      billableMinutes = Math.max(
        0,
        Math.round((recordedAt.getTime() - start.getTime()) / MINUTE_MS) -
          ts.breakMinutes,
      );
      await tx.timesheet.update({
        where: { id: ts.id },
        data: { actualEnd: recordedAt, billableMinutes },
      });
    }

    // Touch / register the device fingerprint and flag hardware reuse.
    const fp = await tx.deviceFingerprint.upsert({
      where: {
        userId_hardwareHash: {
          userId: ts.freelancer.userId,
          hardwareHash: input.deviceHash,
        },
      },
      create: {
        userId: ts.freelancer.userId,
        hardwareHash: input.deviceHash,
        platform: "unknown",
      },
      update: { lastSeenAt: new Date() },
    });

    const otherOwners = await tx.deviceFingerprint.findMany({
      where: {
        hardwareHash: input.deviceHash,
        userId: { not: ts.freelancer.userId },
      },
      select: { userId: true },
    });
    if (otherOwners.length > 0) {
      await tx.deviceFingerprint.update({
        where: { id: fp.id },
        data: {
          trusted: false,
          sharedWithUserIds: otherOwners.map((o) => o.userId),
        },
      });
    }

    // Auto-raise a dispute when a CHECK_IN / CHECK_OUT is off-site or mocked, so
    // it surfaces in the dispute console immediately rather than at approval.
    let disputeRaised: DisputeOrigin | null = null;
    const anchorViolation =
      ANCHOR_EVENTS.includes(input.type) && (!geo.withinGeofence || mocked);

    if (anchorViolation) {
      const origin = mocked
        ? DisputeOrigin.MOCK_LOCATION
        : DisputeOrigin.GEOFENCE_VIOLATION;
      const claimed =
        input.type === GpsEventType.CHECK_OUT ? billableMinutes : scheduledMinutes;
      const reason = mocked
        ? `Mock-locatie gedetecteerd bij ${label(input.type)} (${geo.distanceMeters} m van de vestiging).`
        : `GPS-afwijking van ${geo.distanceMeters} m bij ${label(input.type)} (geofence ${ts.branch.geofenceRadiusMeters} m).`;

      const dispute = await tx.dispute.upsert({
        where: { timesheetId: ts.id },
        create: {
          timesheetId: ts.id,
          raisedById: null,
          origin,
          status: "OPEN",
          reason,
          claimedMinutes: claimed,
          proposedMinutes: claimed,
        },
        update:
          input.type === GpsEventType.CHECK_OUT
            ? { claimedMinutes: claimed, reason }
            : {},
        select: { origin: true },
      });
      disputeRaised = dispute.origin;
    }

    return { event, actualStart, actualEnd, billableMinutes, disputeRaised };
  });

  log.info("gps event recorded", {
    type: input.type,
    withinGeofence: geo.withinGeofence,
    distanceMeters: geo.distanceMeters,
    mocked,
    disputeRaised: result.disputeRaised,
  });

  if (input.type === GpsEventType.CHECK_IN) {
    void recordEngagement(input.freelancerProfileId, "CHECK_IN");
  }

  if (result.disputeRaised) {
    await recordAudit({
      category: "DISPUTE",
      action: "dispute.auto_raised",
      actorLabel: "system",
      severity: "warning",
      summary: `Automatisch geschil geopend (${result.disputeRaised}) op urenbriefje ${ts.id} bij ${label(input.type)}`,
      targetType: "timesheet",
      targetId: ts.id,
      metadata: {
        origin: result.disputeRaised,
        eventType: input.type,
        distanceToBranchMeters: geo.distanceMeters,
        mocked,
        freelancerId: input.freelancerProfileId,
      },
    });
  }

  return {
    eventId: result.event.id,
    type: input.type,
    recordedAt: recordedAt.toISOString(),
    distanceToBranchMeters: geo.distanceMeters,
    withinGeofence: geo.withinGeofence,
    mocked,
    actualStart: result.actualStart?.toISOString() ?? null,
    actualEnd: result.actualEnd?.toISOString() ?? null,
    billableMinutes: result.billableMinutes,
    disputeRaised: result.disputeRaised,
  };
}
