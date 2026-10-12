import { DisputeStatus, TimesheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// The freelancer's side of a manager-proposed hours correction
// (lib/disputes/raise.ts proposeHoursCorrection). Accepting applies the
// correction exactly like an admin's OVERRULE resolution would (the
// freelancer's own consent stands in for that review); rejecting hands it to
// the admin Dispute Console instead of letting the manager just impose it.
// ---------------------------------------------------------------------------

export interface RespondToCorrectionResult {
  status: DisputeStatus;
  resolvedMinutes: number | null;
}

async function loadRespondableDispute(disputeId: string, freelancerUserId: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      timesheet: { select: { id: true, freelancer: { select: { userId: true } } } },
    },
  });
  if (!dispute) throw AppError.notFound("Voorstel niet gevonden");
  if (dispute.timesheet.freelancer.userId !== freelancerUserId) {
    throw AppError.forbidden("Dit voorstel hoort niet bij jouw urenbriefje");
  }
  if (dispute.status !== DisputeStatus.OPEN) {
    throw AppError.conflict("Dit voorstel is al afgehandeld");
  }
  if (!dispute.raisedById || dispute.proposedMinutes === dispute.claimedMinutes) {
    throw AppError.precondition("Dit is geen correctievoorstel om op te reageren");
  }
  return dispute;
}

export async function acceptHoursCorrection(
  disputeId: string,
  freelancerUserId: string,
): Promise<RespondToCorrectionResult> {
  const dispute = await loadRespondableDispute(disputeId, freelancerUserId);

  const [updated] = await prisma.$transaction([
    prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: DisputeStatus.RESOLVED_OVERRULED,
        resolvedMinutes: dispute.proposedMinutes,
        resolvedById: freelancerUserId,
        resolvedAt: new Date(),
        resolutionNote: "Correctie geaccepteerd door de flexwerker",
      },
    }),
    prisma.timesheet.update({
      where: { id: dispute.timesheetId },
      data: { status: TimesheetStatus.SUBMITTED, billableMinutes: dispute.proposedMinutes },
    }),
  ]);

  await recordAudit({
    category: "DISPUTE",
    action: "dispute.correction_accepted",
    actorUserId: freelancerUserId,
    actorLabel: "user",
    summary: `Correctievoorstel ${dispute.id} geaccepteerd (${dispute.claimedMinutes} -> ${dispute.proposedMinutes} min)`,
    targetType: "dispute",
    targetId: dispute.id,
    metadata: { timesheetId: dispute.timesheetId, claimedMinutes: dispute.claimedMinutes, proposedMinutes: dispute.proposedMinutes },
  });
  logger.info("hours correction accepted", { disputeId: dispute.id, timesheetId: dispute.timesheetId });

  return { status: updated.status, resolvedMinutes: dispute.proposedMinutes };
}

export async function rejectHoursCorrection(
  disputeId: string,
  freelancerUserId: string,
): Promise<RespondToCorrectionResult> {
  const dispute = await loadRespondableDispute(disputeId, freelancerUserId);

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status: DisputeStatus.ESCALATED },
  });

  await recordAudit({
    category: "DISPUTE",
    action: "dispute.correction_rejected",
    actorUserId: freelancerUserId,
    actorLabel: "user",
    summary: `Correctievoorstel ${dispute.id} afgewezen — geëscaleerd naar ZekerFlex`,
    targetType: "dispute",
    targetId: dispute.id,
    metadata: { timesheetId: dispute.timesheetId, claimedMinutes: dispute.claimedMinutes, proposedMinutes: dispute.proposedMinutes },
  });
  logger.info("hours correction rejected, escalated", { disputeId: dispute.id, timesheetId: dispute.timesheetId });

  return { status: updated.status, resolvedMinutes: null };
}
