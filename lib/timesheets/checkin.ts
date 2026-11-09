import { DisputeOrigin, GpsEventType, TimesheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { recordEngagement } from "@/lib/engagement/events";
import { evaluateGeofence } from "@/lib/geo/geofencing";
import { dispatchWebhook } from "@/lib/webhooks/dispatcher";
import { badgeNaInchecken } from "@/lib/locatie/printen";
import { OFFLINE_MELDING, beoordeelOffline, liveTijdstip, offlineTijdstip } from "@/lib/timesheets/offline";

// ---------------------------------------------------------------------------
// GPS check-in / heartbeat / check-out ingestion.
//
// Produces the `GpsEvent` trail the dispute console and the timesheet-approval
// route rely on: every event is geofenced against the branch centroid at the
// moment it is recorded, so validity is frozen in the data rather than
// recomputed later from possibly-changed branch coordinates.
//
// Zonder bereik (bron "offline", lib/timesheets/offline.ts): de telefoon
// bewaarde de tik met tijdstip en plek van dat moment en verstuurt hem later.
// De geofence telt op die bewaarde plek; het tijdstip alleen binnen de grenzen
// van offline.ts, anders een weigering (422 met `details.reden`). Elke tik
// heeft een eigen clientId: dubbel versturen geeft het bestaande event terug.
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000;

export interface RecordGpsEventInput {
  timesheetId: string;
  freelancerProfileId: string;
  type: GpsEventType;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  deviceHash: string;
  mocked?: boolean;
  /**
   * Client timestamp. Live: only used when it lies within two minutes before the server clock
   * (otherwise the server clock). Bron "offline": the moment of tapping, within offline.ts' bounds.
   */
  recordedAt?: Date;
  /**
   * "terminal": the event comes from a check-in terminal at the branch itself (lib/incheck/store.ts),
   * so the position is the branch and the device is shared by every worker there — no device
   * fingerprint is registered, and the shared hardware is never flagged as account sharing.
   * "offline": bewaard op de telefoon zonder bereik en later verstuurd (alleen in- en uitchecken).
   */
  bron?: "apparaat" | "terminal" | "offline";
  /** Bron "offline": de klok van de telefoon bij het versturen (voor de verstreken tijd). */
  verzondenOp?: Date;
  /** Eigen id van de telefoon voor deze tik: hetzelfde event twee keer versturen telt één keer. */
  clientId?: string;
  /** De klok van de server (tests). */
  now?: Date;
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
  bron: string;
  /** Bron "offline": wanneer de server het ontving. */
  ontvangenOp: string | null;
  /** Dit event (zelfde clientId) was al eerder binnengekomen: niets nieuws vastgelegd. */
  dubbel: boolean;
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


export async function recordGpsEvent(
  input: RecordGpsEventInput,
): Promise<RecordGpsEventResult> {
  const log = logger.child({
    module: "timesheet-checkin",
    timesheetId: input.timesheetId,
  });
  const now = input.now ?? new Date();
  const bron = input.bron ?? "apparaat";
  const offline = bron === "offline";

  const ts = await prisma.timesheet.findUnique({
    where: { id: input.timesheetId },
    include: {
      branch: {
        select: {
          latitude: true,
          longitude: true,
          geofenceRadiusMeters: true,
          tenantId: true,
        },
      },
      freelancer: { select: { userId: true } },
    },
  });
  if (!ts) throw AppError.notFound("Urenbriefje niet gevonden.");
  if (ts.freelancerId !== input.freelancerProfileId) {
    throw AppError.forbidden("Dit urenbriefje is van een andere werker.");
  }
  if (offline && input.type === GpsEventType.HEARTBEAT) {
    throw AppError.validation("Alleen in- en uitchecken kan zonder bereik worden bewaard.");
  }
  if (offline && !input.recordedAt) {
    throw AppError.validation("Het tijdstip van tikken ontbreekt.");
  }

  const mocked = input.mocked ?? false;
  const scheduledMinutes = Math.max(
    0,
    Math.round(
      (ts.scheduledEnd.getTime() - ts.scheduledStart.getTime()) / MINUTE_MS,
    ) - ts.breakMinutes,
  );

  const result = await prisma.$transaction(async (tx) => {
    // Eén event tegelijk per urenbriefje: twee keer dezelfde tik (opnieuw versturen,
    // twee tabbladen) wordt nooit twee registraties.
    await tx.$queryRaw`SELECT id FROM "Timesheet" WHERE id = ${ts.id} FOR UPDATE`;
    const fresh = await tx.timesheet.findUnique({
      where: { id: ts.id },
      select: { status: true, actualStart: true, actualEnd: true, billableMinutes: true },
    });
    if (!fresh) throw AppError.notFound("Urenbriefje niet gevonden.");
    const events = await tx.gpsEvent.findMany({
      where: { timesheetId: ts.id },
      select: {
        id: true,
        type: true,
        recordedAt: true,
        clientId: true,
        distanceToBranchMeters: true,
        withinGeofence: true,
        mocked: true,
        bron: true,
        ontvangenOp: true,
      },
    });

    // Al binnen (zelfde clientId): het bestaande event terug, niets nieuws.
    const earlier = input.clientId
      ? events.find((e) => e.clientId === input.clientId)
      : undefined;
    if (earlier) {
      if (earlier.type !== input.type) {
        throw AppError.conflict("Deze registratie hoort bij een andere actie.");
      }
      return { kind: "dubbel" as const, earlier, fresh };
    }

    if (fresh.status !== TimesheetStatus.DRAFT) {
      throw AppError.precondition(
        `GPS events can only be recorded while the timesheet is a draft (status ${fresh.status})`,
      );
    }

    const hasCheckIn = events.some((e) => e.type === GpsEventType.CHECK_IN);
    const hasCheckOut = events.some((e) => e.type === GpsEventType.CHECK_OUT);

    if (input.type === GpsEventType.CHECK_IN && hasCheckIn) {
      throw AppError.conflict("Je bent al ingecheckt voor deze dienst.");
    }
    if (input.type !== GpsEventType.CHECK_IN && !hasCheckIn) {
      throw AppError.precondition("Check eerst in voordat je uitcheckt.");
    }
    if (input.type === GpsEventType.CHECK_OUT && hasCheckOut) {
      throw AppError.conflict("Je bent al uitgecheckt voor deze dienst.");
    }

    let recordedAt: Date;
    if (offline && input.recordedAt) {
      const tik = offlineTijdstip({ tikOp: input.recordedAt, verzondenOp: input.verzondenOp, nu: now });
      if (tik === "klok") {
        throw AppError.validation(OFFLINE_MELDING.klok, { reden: "klok" });
      }
      const oordeel = beoordeelOffline({
        type: input.type === GpsEventType.CHECK_IN ? "CHECK_IN" : "CHECK_OUT",
        tik,
        nu: now,
        geplandeStart: ts.scheduledStart,
        geplandEinde: ts.scheduledEnd,
        ingechecktOp: fresh.actualStart,
      });
      if (!oordeel.ok) {
        throw AppError.validation(OFFLINE_MELDING[oordeel.reden], { reden: oordeel.reden });
      }
      recordedAt = tik;
    } else {
      recordedAt = liveTijdstip(input.recordedAt, now);
    }

    // De geofence op de plek van het moment van tikken (bij offline: de bewaarde plek).
    const geo = evaluateGeofence(
      { latitude: input.latitude, longitude: input.longitude },
      { latitude: ts.branch.latitude, longitude: ts.branch.longitude },
      ts.branch.geofenceRadiusMeters,
      input.accuracyMeters,
    );

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
        bron,
        ontvangenOp: offline ? now : null,
        ...(input.clientId ? { clientId: input.clientId } : {}),
      },
    });

    let actualStart = fresh.actualStart;
    let actualEnd = fresh.actualEnd;
    let billableMinutes = fresh.billableMinutes;

    if (input.type === GpsEventType.CHECK_IN) {
      actualStart = recordedAt;
      await tx.timesheet.update({
        where: { id: ts.id },
        data: { actualStart: recordedAt },
      });
    } else if (input.type === GpsEventType.CHECK_OUT) {
      actualEnd = recordedAt;
      const start = fresh.actualStart ?? ts.scheduledStart;
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

    // Touch / register the device fingerprint and flag hardware reuse (not for a
    // terminal: that device is meant to be shared by everyone at the branch).
    const fp = bron === "terminal" ? null : await tx.deviceFingerprint.upsert({
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

    const otherOwners = fp
      ? await tx.deviceFingerprint.findMany({
          where: {
            hardwareHash: input.deviceHash,
            userId: { not: ts.freelancer.userId },
          },
          select: { userId: true },
        })
      : [];
    if (fp && otherOwners.length > 0) {
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

    return {
      kind: "nieuw" as const,
      event,
      geo,
      recordedAt,
      actualStart,
      actualEnd,
      billableMinutes,
      disputeRaised,
    };
  });

  if (result.kind === "dubbel") {
    const e = result.earlier;
    log.info("gps event al binnen (zelfde clientId)", { type: input.type, bron: e.bron });
    return {
      eventId: e.id,
      type: e.type,
      recordedAt: e.recordedAt.toISOString(),
      distanceToBranchMeters: e.distanceToBranchMeters,
      withinGeofence: e.withinGeofence,
      mocked: e.mocked,
      actualStart: result.fresh.actualStart?.toISOString() ?? null,
      actualEnd: result.fresh.actualEnd?.toISOString() ?? null,
      billableMinutes: result.fresh.billableMinutes,
      disputeRaised: null,
      bron: e.bron ?? "apparaat",
      ontvangenOp: e.ontvangenOp?.toISOString() ?? null,
      dubbel: true,
    };
  }

  const { geo, recordedAt } = result;
  log.info("gps event recorded", {
    type: input.type,
    bron,
    withinGeofence: geo.withinGeofence,
    distanceMeters: geo.distanceMeters,
    mocked,
    disputeRaised: result.disputeRaised,
  });

  if (input.type === GpsEventType.CHECK_IN) {
    void recordEngagement(input.freelancerProfileId, "CHECK_IN");
    // Op locatie: een badge of naamsticker in de printwachtrij, als het bedrijf dat aan heeft.
    // Niet bij een offline tik: die komt pas later binnen, de werker is dan al lang binnen.
    if (!offline) {
      void badgeNaInchecken({ tenantId: ts.branch.tenantId, branchId: ts.branchId, timesheetId: ts.id, userId: ts.freelancer.userId });
    }
    void dispatchWebhook("freelancer.checked_in", ts.branch.tenantId, {
      timesheetId: ts.id,
      freelancerId: input.freelancerProfileId,
      recordedAt: recordedAt.toISOString(),
      withinGeofence: geo.withinGeofence,
    }).catch(() => undefined);
  }

  if (result.disputeRaised) {
    void dispatchWebhook("dispute.opened", ts.branch.tenantId, {
      timesheetId: ts.id,
      origin: result.disputeRaised,
    }).catch(() => undefined);
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
    bron,
    ontvangenOp: offline ? now.toISOString() : null,
    dubbel: false,
  };
}
