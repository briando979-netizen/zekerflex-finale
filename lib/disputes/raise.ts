import { DisputeOrigin, TimesheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sendMail, hoursCorrectionProposedEmail } from "@/lib/mail";
import { assertBranchAccess, type Principal } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Two manager-initiated escalations for a SUBMITTED timesheet, both landing
// in the same Dispute row the admin console already knows how to show and
// resolve:
//   - raiseManagerReviewDispute: "please have the platform look at this" (a
//     critical fraud/GPS signal approveTimesheet() refuses on its own).
//     Previously there was no way to get such a timesheet in front of the
//     admin Dispute Console at all — checkin.ts only auto-raises a dispute
//     for an actual off-geofence/mocked CHECK_IN event, not for a signal
//     spotted later (overlap, impossible duration, ...), so it just sat
//     stuck as SUBMITTED with no path forward for anyone.
//   - proposeHoursCorrection: "I think the real number is X, not Y" — a real
//     tegenbod on the submitted hours, mirroring the existing shift-rate
//     tegenbod pattern. Unlike the old correctedBillableMinutes shortcut on
//     approveTimesheet (a unilateral override, no consent, no notice), this
//     requires the freelancer to explicitly accept or reject it — see
//     lib/disputes/respond.ts.
// ---------------------------------------------------------------------------

export async function raiseManagerReviewDispute(input: {
  timesheetId: string;
  principal: Principal;
  reason: string;
}): Promise<{ disputeId: string }> {
  const ts = await prisma.timesheet.findUnique({
    where: { id: input.timesheetId },
    select: { id: true, status: true, billableMinutes: true, branchId: true, branch: { select: { tenantId: true } }, dispute: { select: { id: true } } },
  });
  if (!ts) throw AppError.notFound("Urenbriefje niet gevonden");
  assertBranchAccess(input.principal, ts.branchId, ts.branch.tenantId);
  if (ts.status !== "SUBMITTED") {
    throw AppError.precondition(`Kan geen controle aanvragen vanuit status ${ts.status}`);
  }

  if (ts.dispute) {
    return { disputeId: ts.dispute.id };
  }

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.dispute.create({
      data: {
        timesheetId: ts.id,
        raisedById: input.principal.userId,
        origin: DisputeOrigin.MANAGER_REVIEW,
        reason: input.reason.slice(0, 500),
        claimedMinutes: ts.billableMinutes,
        proposedMinutes: ts.billableMinutes,
      },
    });
    await tx.timesheet.update({
      where: { id: ts.id },
      data: { status: TimesheetStatus.DISPUTED },
    });
    return created;
  });

  await recordAudit({
    category: "DISPUTE",
    action: "dispute.manager_review_requested",
    actorUserId: input.principal.userId,
    actorLabel: "user",
    summary: `Platformcontrole aangevraagd voor urenbriefje ${ts.id}`,
    targetType: "dispute",
    targetId: dispute.id,
    metadata: { timesheetId: ts.id, reason: input.reason },
  });

  return { disputeId: dispute.id };
}

export async function proposeHoursCorrection(input: {
  timesheetId: string;
  principal: Principal;
  proposedMinutes: number;
  note: string;
}): Promise<{ disputeId: string }> {
  if (input.proposedMinutes < 0) {
    throw AppError.validation("Voorgestelde minuten kunnen niet negatief zijn");
  }

  const ts = await prisma.timesheet.findUnique({
    where: { id: input.timesheetId },
    select: {
      id: true,
      status: true,
      billableMinutes: true,
      branchId: true,
      branch: { select: { tenantId: true } },
      dispute: { select: { id: true } },
      assignment: { select: { shift: { select: { title: true } } } },
      freelancer: { select: { user: { select: { fullName: true, email: true } } } },
    },
  });
  if (!ts) throw AppError.notFound("Urenbriefje niet gevonden");
  assertBranchAccess(input.principal, ts.branchId, ts.branch.tenantId);
  if (ts.status !== "SUBMITTED") {
    throw AppError.precondition(`Kan geen correctie voorstellen vanuit status ${ts.status}`);
  }
  if (ts.dispute) {
    throw AppError.conflict("Er loopt al een geschil/voorstel voor dit urenbriefje");
  }
  if (input.proposedMinutes === ts.billableMinutes) {
    throw AppError.validation("Dit is al het ingediende aantal uren — gebruik gewoon Goedkeuren");
  }
  // Mirrors resolveDispute's OVERRULE constraint: a correction only ever
  // proposes FEWER hours than claimed, never more (that's not a "correction").
  if (input.proposedMinutes > ts.billableMinutes) {
    throw AppError.validation("Een voorstel kan niet meer uren zijn dan ingediend");
  }

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.dispute.create({
      data: {
        timesheetId: ts.id,
        raisedById: input.principal.userId,
        origin: DisputeOrigin.MANAGER_REVIEW,
        reason: input.note.slice(0, 500),
        claimedMinutes: ts.billableMinutes,
        proposedMinutes: input.proposedMinutes,
      },
    });
    await tx.timesheet.update({
      where: { id: ts.id },
      data: { status: TimesheetStatus.DISPUTED },
    });
    return created;
  });

  await recordAudit({
    category: "DISPUTE",
    action: "dispute.correction_proposed",
    actorUserId: input.principal.userId,
    actorLabel: "user",
    summary: `Correctie voorgesteld voor urenbriefje ${ts.id}: ${ts.billableMinutes} -> ${input.proposedMinutes} min`,
    targetType: "dispute",
    targetId: dispute.id,
    metadata: { timesheetId: ts.id, claimedMinutes: ts.billableMinutes, proposedMinutes: input.proposedMinutes, note: input.note },
  });

  const freelancerEmail = ts.freelancer.user.email;
  if (freelancerEmail) {
    const link = `${env.APP_BASE_URL.replace(/\/+$/, "")}/dashboard/uren/${ts.id}`;
    const tpl = hoursCorrectionProposedEmail(
      ts.freelancer.user.fullName,
      link,
      ts.assignment?.shift?.title ?? "je dienst",
      ts.billableMinutes / 60,
      input.proposedMinutes / 60,
    );
    await sendMail({ ...tpl, to: freelancerEmail }).catch((err) =>
      logger.warn("hours correction: notify failed", { timesheetId: ts.id, error: (err as Error).message }),
    );
  }

  return { disputeId: dispute.id };
}
