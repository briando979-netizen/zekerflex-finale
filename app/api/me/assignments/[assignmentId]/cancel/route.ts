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
import { resolveShiftContact } from "@/lib/messaging/contacts";
import { offerEmployerClaim } from "@/lib/claims/store";
import { NOTICE_HOURS, LATE_CANCEL_RELIABILITY_PENALTY } from "@/lib/claims/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/assignments/<assignmentId>/cancel { reason }
// The freelancer cancels a shift they took, without a replacement. The seat is
// freed and the shift returns to the marketplace. Cancelling less than
// NOTICE_HOURS before the shift starts offers the employer a 50% claim option
// (see lib/claims/store.ts) and dents the freelancer's reliability score.
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
            endsAt: true,
            breakMinutes: true,
            hourlyRateCents: true,
            positions: true,
            status: true,
            branch: { select: { name: true, tenantId: true } },
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

    const hoursUntilStart = (assignment.shift.startsAt.getTime() - Date.now()) / 3_600_000;
    const late = hoursUntilStart < NOTICE_HOURS;

    await prisma.$transaction(async (tx) => {
      await tx.shiftAssignment.update({
        where: { id: assignment.id },
        data: {
          cancelledAt: new Date(),
          cancelReason: `Afgezegd door flexwerker${late ? " (buiten de opzegtermijn)" : ""}: ${reason}`.slice(0, 600),
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
      if (late) {
        const current = await tx.freelancerProfile.findUnique({ where: { id: profile.id }, select: { reliabilityScore: true } });
        await tx.freelancerProfile.update({
          where: { id: profile.id },
          data: { reliabilityScore: Math.max(0, (current?.reliabilityScore ?? 1) - LATE_CANCEL_RELIABILITY_PENALTY) },
        });
      }
    });

    // Close any open replacement request the freelancer had for this shift.
    const openReq = await getOpenRequestForShift(assignment.shift.id);
    if (openReq && openReq.userId === principal.userId) {
      await cancelReplacementRequest(openReq.id);
    }

    if (late) {
      const hours = Math.max(
        0,
        (assignment.shift.endsAt.getTime() - assignment.shift.startsAt.getTime()) / 3_600_000 -
          assignment.shift.breakMinutes / 60,
      );
      const seatValueCents = Math.round(hours * assignment.shift.hourlyRateCents);
      const contact = await resolveShiftContact(assignment.shift.id);
      await offerEmployerClaim({
        shiftId: assignment.shift.id,
        shiftTitle: assignment.shift.title,
        assignmentId: assignment.id,
        freelancerUserId: principal.userId,
        freelancerName: principal.fullName,
        freelancerProfileId: profile.id,
        employerUserId: contact?.userId ?? null,
        employerTenantId: assignment.shift.branch.tenantId,
        branchName: assignment.shift.branch.name,
        shiftValueCents: seatValueCents,
        reason: `Afgezegd binnen ${NOTICE_HOURS} uur voor aanvang. Reden: ${reason}`,
      }).catch(() => undefined);
    }

    await sendMail({
      to: env.MAIL_ADMIN,
      subject: `Klus afgezegd — ${assignment.shift.title}`,
      kind: "replacement",
      text:
        `${principal.fullName} heeft de dienst "${assignment.shift.title}" bij ${assignment.shift.branch.name} ` +
        `op ${assignment.shift.startsAt.toLocaleString("nl-NL")} afgezegd zonder vervanger ` +
        `(${late ? "buiten de opzegtermijn — opdrachtgever kan 50% claimen" : "binnen de opzegtermijn"}).\n\n` +
        `Reden: ${reason}\n\nDe dienst staat weer open op het platform.`,
    }).catch(() => undefined);

    revalidatePath("/dashboard/diensten");
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true, late, noticeHours: NOTICE_HOURS });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
