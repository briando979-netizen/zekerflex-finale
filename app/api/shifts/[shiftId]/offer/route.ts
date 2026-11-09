import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordOfferResponse } from "@/lib/notifications/dispatcher";
import { pushShiftTaken } from "@/lib/notifications/employer-push";
import { runAfter } from "@/lib/run-after";
import { eisWerkrecht } from "@/lib/werkrecht/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ shiftId: z.string().min(1).max(128) });
const bodySchema = z.object({ decision: z.enum(["ACCEPTED", "DECLINED"]) });

/**
 * POST /api/shifts/:shiftId/offer
 * A freelancer accepts or declines a live shift offer they were notified about.
 */
export async function POST(request: Request, props: { params: Promise<{ shiftId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  const log = logger.child({ route: "POST /api/shifts/[shiftId]/offer" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const { shiftId } = paramsSchema.parse(params);
    const { decision } = bodySchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
      }),
    );

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.forbidden("Je hebt nog geen werkersprofiel. Maak eerst je profiel af.");

    // aannemen pas met recht om te werken (lib/werkrecht); afslaan mag altijd
    if (decision === "ACCEPTED") await eisWerkrecht(principal.userId);
    const result = await recordOfferResponse(shiftId, profile.id, decision);
    if (decision === "ACCEPTED") runAfter(() => pushShiftTaken(shiftId, principal.fullName));
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("offer response failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
