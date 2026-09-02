import { DisputeStatus, TimesheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { assertBranchAccess, type Principal } from "@/lib/auth";

export type DisputeDecision = "APPROVE_CLAIMED" | "OVERRULE";

export interface ResolveDisputeInput {
  disputeId: string;
  principal: Principal;
  decision: DisputeDecision;
  /** Required for OVERRULE: the corrected billable minutes the manager imposes. */
  resolvedMinutes?: number;
  note: string;
}

export interface ResolveDisputeResult {
  disputeId: string;
  status: DisputeStatus;
  resolvedMinutes: number;
  timesheetStatus: TimesheetStatus;
}

/**
 * Resolve an open dispute. APPROVE_CLAIMED accepts the freelancer's submitted
 * hours; OVERRULE imposes a corrected figure. Either way the linked timesheet is
 * moved back to SUBMITTED with the agreed minutes so the standard approval flow
 * (invoicing + payout) can run.
 */
export async function resolveDispute(
  input: ResolveDisputeInput,
): Promise<ResolveDisputeResult> {
  const log = logger.child({ disputeId: input.disputeId, module: "disputes" });

  const dispute = await prisma.dispute.findUnique({
    where: { id: input.disputeId },
    include: { timesheet: { include: { branch: { select: { tenantId: true } } } } },
  });
  if (!dispute) throw AppError.notFound("Dispute not found");

  assertBranchAccess(
    input.principal,
    dispute.timesheet.branchId,
    dispute.timesheet.branch.tenantId,
  );

  if (
    dispute.status === DisputeStatus.RESOLVED_APPROVED ||
    dispute.status === DisputeStatus.RESOLVED_OVERRULED
  ) {
    throw AppError.conflict("Dispute is already resolved");
  }

  let resolvedMinutes: number;
  let status: DisputeStatus;
  if (input.decision === "APPROVE_CLAIMED") {
    resolvedMinutes = dispute.claimedMinutes;
    status = DisputeStatus.RESOLVED_APPROVED;
  } else {
    if (input.resolvedMinutes === undefined || input.resolvedMinutes < 0) {
      throw AppError.validation("OVERRULE requires a non-negative resolvedMinutes");
    }
    if (input.resolvedMinutes > dispute.claimedMinutes) {
      throw AppError.validation(
        "Overruled minutes cannot exceed the freelancer's claimed minutes",
      );
    }
    resolvedMinutes = input.resolvedMinutes;
    status = DisputeStatus.RESOLVED_OVERRULED;
  }

  const [updatedDispute, updatedTimesheet] = await prisma.$transaction([
    prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status,
        resolvedMinutes,
        resolvedById: input.principal.userId,
        resolvedAt: new Date(),
        resolutionNote: input.note,
      },
    }),
    prisma.timesheet.update({
      where: { id: dispute.timesheetId },
      data: {
        status: TimesheetStatus.SUBMITTED,
        billableMinutes: resolvedMinutes,
      },
    }),
  ]);

  log.info("dispute resolved", {
    decision: input.decision,
    resolvedMinutes,
    claimedMinutes: dispute.claimedMinutes,
  });

  await recordAudit({
    category: "DISPUTE",
    action:
      input.decision === "APPROVE_CLAIMED"
        ? "dispute.approved"
        : "dispute.overruled",
    actorUserId: input.principal.userId,
    actorLabel: "user",
    severity: input.decision === "OVERRULE" ? "warning" : "info",
    summary: `Geschil ${dispute.id} ${
      input.decision === "APPROVE_CLAIMED" ? "toegewezen aan flexwerker" : "aangepast door manager"
    } - ${resolvedMinutes} min`,
    targetType: "dispute",
    targetId: dispute.id,
    metadata: {
      origin: dispute.origin,
      claimedMinutes: dispute.claimedMinutes,
      resolvedMinutes,
      timesheetId: dispute.timesheetId,
      note: input.note,
    },
  });

  return {
    disputeId: updatedDispute.id,
    status: updatedDispute.status,
    resolvedMinutes,
    timesheetStatus: updatedTimesheet.status,
  };
}
