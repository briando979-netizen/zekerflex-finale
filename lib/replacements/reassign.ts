import { MatchStatus, ShiftStatus, TimesheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { ensureModelAgreement } from "@/lib/agreements/model-agreement";
import { getReplacementRequest, markReplacementResolved } from "@/lib/replacements/store";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Reassign a shift to a chosen substitute.
//
// The original freelancer raised a replacement request and one or more other
// freelancers responded ("ik neem het over"). When the original picks one, we
// actually move the engagement in the database:
//   - soft-cancel the original ShiftAssignment (+ drop its draft timesheet)
//   - create a fresh ShiftAssignment + draft timesheet for the substitute
//   - provision / reuse the substitute's Wet DBA model agreement
//   - supersede the original's agreement if it only covered this engagement
// Seat count is unchanged (-1 +1) so the shift status stays put.
// ---------------------------------------------------------------------------

export interface ReassignInput {
  requestId: string;
  /** userId of the substitute the original picked */
  substituteUserId: string;
  /** userId performing the pick — must be the original freelancer */
  pickedByUserId: string;
}

export interface ReassignResult {
  newAssignmentId: string;
  shiftTitle: string;
  substituteName: string;
}

export async function reassignAssignment(input: ReassignInput): Promise<ReassignResult> {
  const req = await getReplacementRequest(input.requestId);
  if (!req) throw AppError.notFound("Vervangingsverzoek niet gevonden.");
  if (req.userId !== input.pickedByUserId) {
    throw AppError.forbidden("Alleen degene die de klus afstaat kan een vervanger kiezen.");
  }
  if (req.status !== "open") {
    throw AppError.conflict("Dit vervangingsverzoek is al afgerond.");
  }
  if (!req.responses.some((r) => r.userId === input.substituteUserId)) {
    throw AppError.validation("Deze kandidaat heeft niet op je verzoek gereageerd.");
  }
  if (input.substituteUserId === req.userId) {
    throw AppError.validation("Je kunt jezelf niet als vervanger kiezen.");
  }

  const substitute = await prisma.freelancerProfile.findUnique({
    where: { userId: input.substituteUserId },
    select: {
      id: true,
      kvkValid: true,
      isBlacklisted: true,
      matchingBlockedUntil: true,
      user: { select: { kycStatus: true, fullName: true } },
    },
  });
  if (!substitute) throw AppError.validation("Deze kandidaat heeft geen freelancer-profiel meer.");
  if (substitute.user.kycStatus !== "VERIFIED" || !substitute.kvkValid) {
    throw AppError.precondition("Deze kandidaat is niet volledig geverifieerd.");
  }
  if (substitute.isBlacklisted) throw AppError.precondition("Deze kandidaat kan geen diensten aannemen.");
  if (substitute.matchingBlockedUntil && substitute.matchingBlockedUntil.getTime() > Date.now()) {
    throw AppError.precondition("Matching voor deze kandidaat is tijdelijk beperkt.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const original = await tx.shiftAssignment.findUnique({
      where: { id: req.assignmentId },
      select: {
        id: true,
        freelancerId: true,
        cancelledAt: true,
        shift: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            breakMinutes: true,
            hourlyRateCents: true,
            branchId: true,
            branch: { select: { tenantId: true } },
          },
        },
        timesheet: { select: { id: true, status: true } },
        modelAgreement: { select: { id: true, assignmentId: true } },
      },
    });
    if (!original) throw AppError.notFound("De oorspronkelijke dienst bestaat niet meer.");
    if (original.cancelledAt) throw AppError.conflict("Deze dienst is al geannuleerd.");
    if (original.shift.startsAt.getTime() < Date.now()) {
      throw AppError.precondition("Deze dienst is al begonnen — vervanging kan niet meer.");
    }
    if (original.freelancerId === substitute.id) {
      throw AppError.validation("De vervanger doet deze dienst al.");
    }

    const clash = await tx.shiftAssignment.findUnique({
      where: { shiftId_freelancerId: { shiftId: original.shift.id, freelancerId: substitute.id } },
      select: { id: true, cancelledAt: true },
    });
    if (clash && !clash.cancelledAt) {
      throw AppError.conflict("De vervanger staat al op deze dienst ingepland.");
    }

    // 1. Soft-cancel the original.
    await tx.shiftAssignment.update({
      where: { id: original.id },
      data: { cancelledAt: new Date(), cancelReason: "Vervangen via ZekerFlex (vrije vervanging)" },
    });
    if (original.timesheet && original.timesheet.status === TimesheetStatus.DRAFT) {
      await tx.timesheet.delete({ where: { id: original.timesheet.id } });
    }
    // Keep the original's model agreement open (it covers the whole client
    // relationship) but unlink it from the now-cancelled assignment.
    if (original.modelAgreement && original.modelAgreement.assignmentId === original.id) {
      await tx.modelAgreement.update({
        where: { id: original.modelAgreement.id },
        data: { assignmentId: null },
      });
    }

    // 2. Create the substitute's engagement (reuse a prior cancelled row if present).
    const assignment = clash
      ? await tx.shiftAssignment.update({
          where: { id: clash.id },
          data: { cancelledAt: null, cancelReason: null, source: MatchStatus.ACCEPTED, acceptedAt: new Date() },
        })
      : await tx.shiftAssignment.create({
          data: { shiftId: original.shift.id, freelancerId: substitute.id, source: MatchStatus.ACCEPTED },
        });

    await tx.timesheet.upsert({
      where: { assignmentId: assignment.id },
      create: {
        assignmentId: assignment.id,
        freelancerId: substitute.id,
        branchId: original.shift.branchId,
        scheduledStart: original.shift.startsAt,
        scheduledEnd: original.shift.endsAt,
        breakMinutes: original.shift.breakMinutes,
        hourlyRateCents: original.shift.hourlyRateCents,
      },
      update: {
        freelancerId: substitute.id,
        scheduledStart: original.shift.startsAt,
        scheduledEnd: original.shift.endsAt,
        breakMinutes: original.shift.breakMinutes,
        hourlyRateCents: original.shift.hourlyRateCents,
        status: TimesheetStatus.DRAFT,
      },
    });

    await tx.shiftMatch.updateMany({
      where: { shiftId: original.shift.id, freelancerId: substitute.id },
      data: { status: MatchStatus.ACCEPTED, respondedAt: new Date() },
    });

    await ensureModelAgreement(tx, {
      freelancerId: substitute.id,
      tenantId: original.shift.branch.tenantId,
      branchId: original.shift.branchId,
      shiftId: original.shift.id,
      assignmentId: assignment.id,
      hourlyRateCents: original.shift.hourlyRateCents,
      scopeDescription: original.shift.title,
    });

    // Seat count is unchanged; make sure the shift isn't left as OPEN/MATCHING.
    const activeCount = await tx.shiftAssignment.count({
      where: { shiftId: original.shift.id, cancelledAt: null },
    });
    const shift = await tx.shift.findUniqueOrThrow({
      where: { id: original.shift.id },
      select: { positions: true, status: true },
    });
    const desired = activeCount >= shift.positions ? ShiftStatus.FILLED : ShiftStatus.PARTIALLY_FILLED;
    if (shift.status !== desired) {
      await tx.shift.update({ where: { id: original.shift.id }, data: { status: desired } });
    }

    return { newAssignmentId: assignment.id, shiftTitle: original.shift.title };
  });

  await markReplacementResolved(input.requestId, {
    userId: input.substituteUserId,
    name: substitute.user.fullName,
  });

  logger.info("replacement reassigned", {
    requestId: input.requestId,
    shiftId: req.shiftId,
    from: req.userId,
    to: input.substituteUserId,
  });

  await sendMail({
    to: env.MAIL_ADMIN,
    subject: `Vervanging geregeld — ${result.shiftTitle}`,
    kind: "replacement",
    text:
      `${req.freelancerName} heeft de dienst "${result.shiftTitle}" bij ${req.branch} ` +
      `(${new Date(req.startsAt).toLocaleString("nl-NL")}) overgedragen aan ${substitute.user.fullName}.\n\n` +
      `Nieuwe assignment: ${result.newAssignmentId}. Verzoek-id: ${input.requestId}.`,
  }).catch(() => undefined);

  return {
    newAssignmentId: result.newAssignmentId,
    shiftTitle: result.shiftTitle,
    substituteName: substitute.user.fullName,
  };
}
