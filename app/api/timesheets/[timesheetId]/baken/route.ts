import { NextResponse } from "next/server";
import { z } from "zod";
import { GpsEventType } from "@prisma/client";
import { withAuth } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordGpsEvent } from "@/lib/timesheets/checkin";
import { bakenBewijs, bakenInstellingen, bakenTokenGeldig, bewaarBakenBewijs } from "@/lib/checkin/baken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Locatiebaken bij een urenbriefje (lib/checkin/baken.ts):
//   GET  → de geofence van de vestiging, de baken-instellingen en het bewijs tot nu toe
//          (de app beslist daarmee zelf over automatisch in-/uitchecken);
//   POST → in- of uitchecken mét bewijs: een gescande QR-code (token) of een
//          gevonden Bluetooth-baken (naam). De gps-check-in zelf loopt via
//          recordGpsEvent, precies als de gewone knop; het bewijs komt erbij.

const schema = z.object({
  type: z.enum(["CHECK_IN", "CHECK_OUT"]),
  bron: z.enum(["qr", "ble"]),
  token: z.string().trim().max(64).optional(),
  bleNaam: z.string().trim().max(40).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(10_000),
  deviceHash: z.string().min(4).max(128),
  recordedAt: z.string().datetime().optional(),
});

async function eigenTimesheet(userId: string, timesheetId: string) {
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualEnd: true,
      freelancer: { select: { id: true, userId: true } },
      branch: { select: { id: true, name: true, latitude: true, longitude: true, geofenceRadiusMeters: true } },
    },
  });
  if (!ts) throw AppError.notFound("Urenbriefje niet gevonden");
  if (ts.freelancer.userId !== userId) throw AppError.forbidden("Dit urenbriefje is niet van jou");
  return ts;
}

export const GET = withAuth<{ timesheetId: string }>(async (_req, { params, principal }) => {
  const ts = await eigenTimesheet(principal.userId, params.timesheetId);
  const [inst, bewijs] = await Promise.all([bakenInstellingen(ts.branch.id), bakenBewijs(ts.id)]);
  return NextResponse.json({
    branch: { id: ts.branch.id, name: ts.branch.name, latitude: ts.branch.latitude, longitude: ts.branch.longitude, geofenceRadiusMeters: ts.branch.geofenceRadiusMeters },
    baken: { qr: inst.qr, bleNaam: inst.bleNaam, automatisch: inst.automatisch },
    bewijs: bewijs?.gebeurtenissen ?? [],
    scheduledStart: ts.scheduledStart.toISOString(),
    scheduledEnd: ts.scheduledEnd.toISOString(),
    actualStart: ts.actualStart?.toISOString() ?? null,
    actualEnd: ts.actualEnd?.toISOString() ?? null,
  });
});

export const POST = withAuth<{ timesheetId: string }>(async (req, { params, principal }) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Controleer de gegevens van het baken", parsed.error.flatten());
  const d = parsed.data;
  const ts = await eigenTimesheet(principal.userId, params.timesheetId);
  const inst = await bakenInstellingen(ts.branch.id);

  if (d.bron === "qr") {
    if (!inst.qr) throw AppError.precondition("Deze vestiging gebruikt geen QR-code");
    if (!d.token || !bakenTokenGeldig(ts.branch.id, inst.qrVersie, d.token)) throw AppError.validation("Deze QR-code hoort niet bij deze locatie of is vervangen");
  } else {
    if (!inst.bleNaam) throw AppError.precondition("Deze vestiging gebruikt geen Bluetooth-baken");
    if (!d.bleNaam || d.bleNaam.toLowerCase() !== inst.bleNaam.toLowerCase()) throw AppError.validation("Dit is niet het baken van deze locatie");
  }

  const gps = await recordGpsEvent({
    timesheetId: ts.id,
    freelancerProfileId: ts.freelancer.id,
    type: d.type === "CHECK_IN" ? GpsEventType.CHECK_IN : GpsEventType.CHECK_OUT,
    latitude: d.latitude,
    longitude: d.longitude,
    accuracyMeters: d.accuracyMeters,
    deviceHash: d.deviceHash,
    ...(d.recordedAt ? { recordedAt: new Date(d.recordedAt) } : {}),
  });
  const bewijs = await bewaarBakenBewijs(ts.id, { type: d.type, bron: d.bron, at: gps.recordedAt, ...(d.bleNaam ? { naam: d.bleNaam } : {}) });
  logger.info("baken check", { timesheetId: ts.id, branchId: ts.branch.id, bron: d.bron, type: d.type, withinGeofence: gps.withinGeofence });
  return NextResponse.json({ ...gps, bewijs: bewijs.gebeurtenissen });
});
