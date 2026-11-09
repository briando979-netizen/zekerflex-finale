import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordGpsEvent } from "@/lib/timesheets/checkin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ timesheetId: z.string().min(1).max(128) });

const bodySchema = z.object({
  type: z.enum(["CHECK_IN", "HEARTBEAT", "CHECK_OUT"]),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracyMeters: z.number().nonnegative().max(10_000),
  deviceHash: z.string().min(8).max(128),
  mocked: z.boolean().optional(),
  recordedAt: z.string().datetime().optional(),
  /** eigen id van de telefoon per tik (crypto.randomUUID): dubbel versturen telt één keer */
  clientId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
  /** zonder bereik bewaard op de telefoon; recordedAt is dan het moment van tikken */
  offline: z.boolean().optional(),
  /** bij offline: de klok van de telefoon bij het versturen */
  verzondenOp: z.string().datetime().optional(),
});

/**
 * POST /api/timesheets/:timesheetId/gps
 *
 * A freelancer records a GPS check-in / heartbeat / check-out for their own
 * (draft) timesheet. Each event is geofenced against the branch and stored;
 * CHECK_IN sets `actualStart`, CHECK_OUT sets `actualEnd` + billable minutes.
 * `offline: true`: een tik die zonder bereik op de telefoon is bewaard
 * (lib/timesheets/offline.ts); buiten de grenzen 422 met `details.reden`.
 * Hetzelfde `clientId` nog eens: 200 met het bestaande event (`dubbel`).
 */
export async function POST(request: Request, props: { params: Promise<{ timesheetId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  const log = logger.child({ route: "POST /api/timesheets/[timesheetId]/gps" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const { timesheetId } = paramsSchema.parse(params);
    const body = bodySchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
      }),
    );

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.forbidden("Je hebt nog geen werkersprofiel. Maak eerst je profiel af.");

    const result = await recordGpsEvent({
      timesheetId,
      freelancerProfileId: profile.id,
      type: body.type,
      latitude: body.latitude,
      longitude: body.longitude,
      accuracyMeters: body.accuracyMeters,
      deviceHash: body.deviceHash,
      ...(body.mocked !== undefined ? { mocked: body.mocked } : {}),
      ...(body.recordedAt ? { recordedAt: new Date(body.recordedAt) } : {}),
      ...(body.clientId ? { clientId: body.clientId } : {}),
      ...(body.offline ? { bron: "offline" as const } : {}),
      ...(body.offline && body.verzondenOp ? { verzondenOp: new Date(body.verzondenOp) } : {}),
    });

    return NextResponse.json(result, { status: result.dubbel ? 200 : 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("gps event failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
