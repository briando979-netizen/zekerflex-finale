import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

const rescheduleSchema = z.object({
  shiftId: z.string(),
  newStartTime: z.string().datetime(),
  newEndTime: z.string().datetime(),
});

const cancelSchema = z.object({
  shiftId: z.string(),
  reason: z.string().max(500),
});

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];

    if (!tenantId) {
      throw AppError.precondition("No organization linked");
    }

    const action = request.nextUrl.searchParams.get("action");
    const body = await request.json();

    if (action === "reschedule") {
      const { shiftId, newStartTime, newEndTime } = rescheduleSchema.parse(body);

      const shift = await prisma.shift.findUnique({
        where: { id: shiftId },
        include: { branch: { select: { tenantId: true } } },
      });

      if (!shift || shift.branch.tenantId !== tenantId) {
        throw AppError.forbidden("Shift not found or access denied");
      }

      await prisma.shift.update({
        where: { id: shiftId },
        data: {
          startsAt: new Date(newStartTime),
          endsAt: new Date(newEndTime),
        },
      });

      return NextResponse.json({ ok: true, message: "Shift rescheduled" });
    }

    if (action === "cancel") {
      const { shiftId, reason } = cancelSchema.parse(body);

      const shift = await prisma.shift.findUnique({
        where: { id: shiftId },
        include: { branch: { select: { tenantId: true } } },
      });

      if (!shift || shift.branch.tenantId !== tenantId) {
        throw AppError.forbidden("Shift not found or access denied");
      }

      await prisma.shift.update({
        where: { id: shiftId },
        data: { status: "CANCELLED" },
      });

      return NextResponse.json({ ok: true, message: "Shift cancelled" });
    }

    throw AppError.validation("Unknown action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
