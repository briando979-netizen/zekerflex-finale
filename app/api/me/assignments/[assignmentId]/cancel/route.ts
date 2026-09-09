import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ShiftStatus, TimesheetStatus } from "@prisma/client";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toErrorBody, AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { cancelReplacementRequest, getOpenRequestForShift } from "@/lib/replacements/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/assignments/<assignmentId>/cancel { reason }
// The freelancer cancels a shift they took, without a replacement. The seat is
// freed and the shift returns to the marketplace. Counts toward reliability.
export async function POST(request: Request, props: { params: Promise<{ assignmentId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const principal = await requirePrincipal();
    const { reason } = z
      .object({ reason: z.string().trim().min(3).max(600) })
      .parse(await request.json().catch(() => ({})));

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.forbidden("Geen freelancer-profiel");

    const assignment = await prisma.shiftAssignment.findFirst({
      where: { id: params.assignmentId, freelancerId: profile.id },
      select: {
        id: true,
        cancelledAt: true,
        shift: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            positions: true,
            status: true,
            branch: { select: { name: true } },
          },
        },
        timesheet: { select: { id: true, status: true } },
      },
    });
    if (!assignment) throw AppError.notFound("Dienst niet gevonden");
    if (assignment.cancelledAt) throw AppError.conflict("Deze dienst is al geannuleerd.");
    if (assignment.shift.startsAt.getTime() < Date.now()) {
      throw AppError.precondition("Deze dienst is al begonnen — neem contact op met de opdrachtgever.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.shiftAssignment.update({
        where: { id: assignment.id },
        data: {
          cancelledAt: new Date(),
          cancelReason: `Afgezegd door flexwerker: ${reason}`.slice(0, 600),
        },
      });
      if (assignment.timesheet && assignment.timesheet.status === TimesheetStatus.DRAFT) {
        await tx.timesheet.delete({ where: { id: assignment.timesheet.id } });
      }
      const active = await tx.shiftAssignment.count({
        where: { shiftId: assignment.shift.id, cancelledAt: null },
      });
      const next = active <= 0 ? ShiftStatus.OPEN : ShiftStatus.PARTIALLY_FILLED;
      if (assignment.shift.status !== next) {
        await tx.shift.update({ where: { id: assignment.shift.id }, data: { status: next } });
      }
    });

    // Close any open replacement request the freelancer had for this shift.
    const openReq = await getOpenRequestForShift(assignment.shift.id);
    if (openReq && openReq.userId === principal.userId) {
      await cancelReplacementRequest(openReq.id);
    }

    await sendMail({
      to: env.MAIL_ADMIN,
      subject: `Klus afgezegd — ${assignment.shift.title}`,
      kind: "replacement",
      text:
        `${principal.fullName} heeft de dienst "${assignment.shift.title}" bij ${assignment.shift.branch.name} ` +
        `op ${assignment.shift.startsAt.toLocaleString("nl-NL")} afgezegd zonder vervanger.\n\n` +
        `Reden: ${reason}\n\nDe dienst staat weer open op het platform.`,
    }).catch(() => undefined);

    revalidatePath("/dashboard/diensten");
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
