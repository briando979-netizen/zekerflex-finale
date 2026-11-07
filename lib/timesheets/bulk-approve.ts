import { prisma } from "@/lib/prisma";
import { approveTimesheet } from "@/lib/timesheets/approve";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { Principal } from "@/lib/auth";

/**
 * Bulk timesheet approval voor werkgevers
 * Goedkeuren van meerdere uren tegelijk (bijv. alle uren van deze week)
 */

export interface BulkApprovalInput {
  timesheetIds: string[];
  branchId: string;
  correctedBillableMinutes?: Record<string, number>; // timesheetId -> minutes
  overrideGpsCheck?: boolean;
}

export interface BulkApprovalResult {
  approved: number;
  failed: Array<{ timesheetId: string; error: string }>;
  totalAmount: number;
}

/**
 * Bulk approve timesheets
 * Valideer eerst, dan approve reeks (stopt bij eerste fout)
 */
export async function bulkApproveTimesheets(
  input: BulkApprovalInput,
  principal: Principal,
): Promise<BulkApprovalResult> {
  if (!input.timesheetIds || input.timesheetIds.length === 0) {
    throw AppError.validation("Geen urenbriefjes geselecteerd");
  }

  if (input.timesheetIds.length > 50) {
    throw AppError.validation("Maximaal 50 urenbriefjes tegelijk");
  }

  const approved: string[] = [];
  const failed: Array<{ timesheetId: string; error: string }> = [];
  let totalAmount = 0;

  for (const timesheetId of input.timesheetIds) {
    try {
      // Controleer eerst dat timesheet bij deze branch hoort
      const ts = await prisma.timesheet.findUnique({
        where: { id: timesheetId },
        select: { branchId: true, billingAmount: true },
      });

      if (!ts) {
        failed.push({ timesheetId, error: "Urenbriefje niet gevonden" });
        continue;
      }

      if (ts.branchId !== input.branchId) {
        failed.push({ timesheetId, error: "Niet van deze locatie" });
        continue;
      }

      // Goedkeuren
      const result = await approveTimesheet({
        timesheetId,
        principal,
        correctedBillableMinutes: input.correctedBillableMinutes?.[timesheetId],
        overrideGpsCheck: input.overrideGpsCheck,
      });

      approved.push(timesheetId);
      const invoiceAmount = result.invoices.reduce((sum, inv) => sum + inv.totalCents, 0);
      totalAmount += invoiceAmount;

      logger.info("bulk-approve-timesheet", { timesheetId, amount: invoiceAmount });
    } catch (err) {
      failed.push({ timesheetId, error: (err as Error).message });
      logger.warn("bulk-approve-timesheet-error", { timesheetId, error: (err as Error).message });
    }
  }

  if (approved.length === 0 && failed.length > 0) {
    throw AppError.precondition(
      `Geen urenbriefjes goedgekeurd: ${failed[0]?.error || "onbekende fout"}`,
    );
  }

  logger.info("bulk-approve-complete", {
    approved: approved.length,
    failed: failed.length,
    totalAmount,
  });

  return { approved: approved.length, failed, totalAmount };
}

/**
 * Haal openstaande urenbriefjes op (SUBMITTED/DISPUTED)
 */
export async function getPendingTimesheets(branchId: string, limit = 50) {
  return prisma.timesheet.findMany({
    where: {
      branchId,
      status: { in: ["SUBMITTED", "DISPUTED"] },
    },
    include: {
      freelancer: { select: { user: { select: { fullName: true } } } },
      branch: { select: { name: true } },
    },
    orderBy: { submittedAt: "asc" },
    take: limit,
  });
}

/**
 * Reject multiple timesheets
 */
export async function bulkRejectTimesheets(
  timesheetIds: string[],
  reason: string,
  branchId: string,
): Promise<{ rejected: number }> {
  if (!reason || reason.length < 5) {
    throw AppError.validation("Reden moet minstens 5 karakters zijn");
  }

  const updated = await prisma.timesheet.updateMany({
    where: {
      id: { in: timesheetIds },
      branchId,
      status: { in: ["SUBMITTED", "DISPUTED"] },
    },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
      rejectedAt: new Date(),
    },
  });

  logger.info("bulk-reject-timesheets", {
    count: updated.count,
    branchId,
    reason: reason.slice(0, 50),
  });

  return { rejected: updated.count };
}
