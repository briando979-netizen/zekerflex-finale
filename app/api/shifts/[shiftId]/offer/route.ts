import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordOfferResponse } from "@/lib/notifications/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ shiftId: z.string().min(1).max(128) });
const bodySchema = z.object({ decision: z.enum(["ACCEPTED", "DECLINED"]) });

/**
 * POST /api/shifts/:shiftId/offer
 * A freelancer accepts or declines a live shift offer they were notified about.
 */
export async function POST(
  request: Request,
  { params }: { params: { shiftId: string } },
): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/shifts/[shiftId]/offer" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const { shiftId } = paramsSchema.parse(params);
    const { decision } = bodySchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be valid JSON");
      }),
    );

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.forbidden("No freelancer profile for this user");

    const result = await recordOfferResponse(shiftId, profile.id, decision);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("offer response failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
