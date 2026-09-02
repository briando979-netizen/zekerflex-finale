import {
  InvoiceStatus,
  PaymentStatus,
  TimesheetStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { acquireLock } from "@/lib/redis";
import { recordAudit } from "@/lib/audit";
import { assertBranchAccess, type Principal } from "@/lib/auth";
import { nextInvoiceNumber } from "@/lib/billing/numbering";
import { buildReverseBillingInvoices } from "@/lib/billing/self-billing";
import {
  isValidIban,
  payoutEndToEndId,
  triggerInstantPayout,
} from "@/lib/billing/sepa";
import { evaluateDbaCompliance } from "@/lib/dba-compliance";
import type { ComputedInvoice } from "@/types/billing";

export interface ApproveTimesheetInput {
  timesheetId: string;
  principal: Principal;
  /** Manager-corrected billable minutes; when omitted the submitted value stands. */
  correctedBillableMinutes?: number;
  /** Approve despite a missing / out-of-geofence GPS check-in (audited). */
  overrideGpsCheck?: boolean;
  correctionNote?: string;
}

export interface ApproveTimesheetResult {
  timesheetId: string;
  status: TimesheetStatus;
  billableMinutes: number;
  invoices: {
    id: string;
    number: string;
    type: ComputedInvoice["type"];
    totalCents: number;
    vatCents: number;
  }[];
  payout: {
    paymentId: string;
    status: PaymentStatus;
    amountCents: number;
    endToEndId: string;
    providerRef: string | null;
  };
  dba: { riskLevel: string; action: string } | null;
}

const MINUTE_MS = 60_000;

function computeBillableMinutes(t: {
  actualStart: Date | null;
  actualEnd: Date | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  breakMinutes: number;
}): number {
  const start = t.actualStart ?? t.scheduledStart;
  const end = t.actualEnd ?? t.scheduledEnd;
  const gross = Math.round((end.getTime() - start.getTime()) / MINUTE_MS);
  return Math.max(0, gross - t.breakMinutes);
}

/**
 * Approve a submitted timesheet and, atomically, produce the two reverse-billing
 * invoices (freelancer services + platform fee). The instant SEPA payout is
 * triggered immediately after the invoices commit; a payout failure leaves the
 * timesheet APPROVED with a FAILED/PENDING payment for retry rather than
 * rolling back the approval.
 */
export async function approveTimesheet(
  input: ApproveTimesheetInput,
): Promise<ApproveTimesheetResult> {
  const { timesheetId, principal } = input;
  const log = logger.child({ timesheetId, module: "timesheet-approve" });

  const unlock = await acquireLock(`timesheet:approve:${timesheetId}`, 20_000);
  if (!unlock) throw AppError.conflict("Approval already in progress");

  try {
    const ts = await prisma.timesheet.findUnique({
      where: { id: timesheetId },
      include: {
        gpsEvents: { orderBy: { recordedAt: "asc" } },
        dispute: true,
        branch: { include: { tenant: true } },
        freelancer: { include: { user: true } },
      },
    });
    if (!ts) throw AppError.notFound("Timesheet not found");

    assertBranchAccess(principal, ts.branchId, ts.branch.tenantId);

    if (
      ts.status !== TimesheetStatus.SUBMITTED &&
      ts.status !== TimesheetStatus.DISPUTED
    ) {
      throw AppError.precondition(
        `Timesheet cannot be approved from status ${ts.status}`,
      );
    }

    // --- GPS check-in verification -------------------------------------
    const checkIn = ts.gpsEvents.find((e) => e.type === "CHECK_IN");
    if (!input.overrideGpsCheck) {
      if (!checkIn) {
        throw AppError.precondition(
          "No GPS check-in recorded; use overrideGpsCheck to approve manually",
        );
      }
      if (checkIn.mocked) {
        throw AppError.precondition(
          "GPS check-in came from a mock-location provider; manual review required",
        );
      }
      if (!checkIn.withinGeofence) {
        throw AppError.precondition(
          `GPS check-in was ${Math.round(
            checkIn.distanceToBranchMeters,
          )}m outside the branch geofence; manual review required`,
        );
      }
    }

    // --- Payout destination -------------------------------------------
    const iban = ts.freelancer.payoutIban;
    if (!iban || !isValidIban(iban)) {
      throw AppError.precondition("Freelancer has no valid payout IBAN on file");
    }

    const platformTenant = await prisma.tenant.findFirst({
      where: { type: "PLATFORM" },
      select: { id: true },
    });
    if (!platformTenant) {
      throw AppError.precondition("Platform tenant is not configured");
    }

    const billableMinutes =
      input.correctedBillableMinutes ??
      (ts.billableMinutes > 0
        ? ts.billableMinutes
        : computeBillableMinutes(ts));
    if (billableMinutes <= 0) {
      throw AppError.validation("Billable minutes must be positive");
    }

    // --- Transaction: approve + invoices + pending payment ------------
    const persisted = await prisma.$transaction(async (tx) => {
      const freelancerNumber = await nextInvoiceNumber(
        tx,
        "SELF_BILL_FREELANCER",
      );
      const platformNumber = await nextInvoiceNumber(tx, "PLATFORM_FEE");

      const billing = buildReverseBillingInvoices({
        timesheetId: ts.id,
        billableMinutes,
        hourlyRateCents: ts.hourlyRateCents,
        freelancerId: ts.freelancerId,
        freelancerCountry: ts.freelancer.country,
        freelancerVatValid: ts.freelancer.vatValid,
        recipientTenantId: ts.branch.tenantId,
        recipientCountry: ts.branch.tenant.country,
        platformTenantId: platformTenant.id,
        shiftTitle: `Shift @ ${ts.branch.name}`,
        workedOn: ts.scheduledStart,
        freelancerInvoiceNumber: freelancerNumber,
        platformInvoiceNumber: platformNumber,
      });

      const updated = await tx.timesheet.update({
        where: { id: ts.id },
        data: {
          status: TimesheetStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: principal.userId,
          billableMinutes,
        },
      });

      if (ts.dispute && ts.dispute.status !== "RESOLVED_APPROVED" && ts.dispute.status !== "RESOLVED_OVERRULED") {
        await tx.dispute.update({
          where: { id: ts.dispute.id },
          data: {
            status:
              input.correctedBillableMinutes === undefined
                ? "RESOLVED_APPROVED"
                : "RESOLVED_OVERRULED",
            resolvedMinutes: billableMinutes,
            resolvedById: principal.userId,
            resolvedAt: new Date(),
            resolutionNote:
              input.correctionNote ?? "Resolved during timesheet approval",
          },
        });
      }

      const freelancerInvoice = await persistInvoice(
        tx,
        billing.freelancerInvoice,
      );
      await persistInvoice(tx, billing.platformFeeInvoice);

      const payment = await tx.payment.create({
        data: {
          invoiceId: freelancerInvoice.id,
          method: "SEPA_INSTANT",
          status: PaymentStatus.PENDING,
          amountCents: billing.freelancerPayoutCents,
          debtorIban: env.SEPA_CREDITOR_IBAN ?? "UNKNOWN",
          creditorIban: iban,
          endToEndId: payoutEndToEndId(freelancerInvoice.id),
        },
      });

      return {
        timesheet: updated,
        freelancerInvoice,
        payment,
        billing,
      };
    });

    log.info("timesheet approved, invoices issued", {
      freelancerInvoice: persisted.freelancerInvoice.number,
      payoutCents: persisted.billing.freelancerPayoutCents,
    });

    // --- Instant SEPA payout (outside the DB transaction) ------------
    let payoutStatus = persisted.payment.status;
    let providerRef: string | null = null;
    try {
      const result = await triggerInstantPayout({
        endToEndId: persisted.payment.endToEndId,
        amountCents: persisted.payment.amountCents,
        currency: "EUR",
        creditorIban: iban,
        creditorName: ts.freelancer.user.fullName,
        remittanceInfo: `ZekerFlex ${persisted.freelancerInvoice.number}`,
      });
      payoutStatus = result.status;
      providerRef = result.providerRef;

      await prisma.payment.update({
        where: { id: persisted.payment.id },
        data: {
          status: result.status,
          providerRef: result.providerRef,
          submittedAt: result.acceptedAt ? new Date(result.acceptedAt) : new Date(),
          settledAt:
            result.status === PaymentStatus.SETTLED ? new Date() : null,
          failureCode: result.failureCode ?? null,
        },
      });

      if (result.status === PaymentStatus.SETTLED) {
        await prisma.$transaction([
          prisma.invoice.update({
            where: { id: persisted.freelancerInvoice.id },
            data: { status: InvoiceStatus.PAID },
          }),
          prisma.timesheet.update({
            where: { id: ts.id },
            data: { status: TimesheetStatus.PAID },
          }),
        ]);
      }
    } catch (err) {
      payoutStatus = PaymentStatus.FAILED;
      const message = err instanceof AppError ? err.message : "Payout error";
      await prisma.payment.update({
        where: { id: persisted.payment.id },
        data: { status: PaymentStatus.FAILED, failureCode: message.slice(0, 120) },
      });
      log.error("instant payout failed; queued for retry", { error: message });
    }

    await recordAudit({
      category: "TIMESHEET",
      action: "timesheet.approved",
      actorUserId: principal.userId,
      actorLabel: "user",
      severity: input.overrideGpsCheck ? "warning" : "info",
      summary: `Urenbriefje ${ts.id} goedgekeurd (${billableMinutes} min) - ${ts.branch.name}`,
      targetType: "timesheet",
      targetId: ts.id,
      metadata: {
        billableMinutes,
        correctedBillableMinutes: input.correctedBillableMinutes ?? null,
        overrodeGpsCheck: Boolean(input.overrideGpsCheck),
        freelancerId: ts.freelancerId,
        freelancerInvoice: persisted.freelancerInvoice.number,
        payoutStatus,
        payoutCents: persisted.payment.amountCents,
        resolvedDisputeId: ts.dispute?.id ?? null,
      },
    });

    // --- DBA compliance re-evaluation (best effort) -----------------
    let dba: ApproveTimesheetResult["dba"] = null;
    try {
      const evaluation = await evaluateDbaCompliance(
        ts.freelancerId,
        ts.branchId,
      );
      dba = { riskLevel: evaluation.riskLevel, action: evaluation.action };
    } catch (err) {
      log.warn("DBA evaluation failed", { error: (err as Error).message });
    }

    return {
      timesheetId: ts.id,
      status:
        payoutStatus === PaymentStatus.SETTLED
          ? TimesheetStatus.PAID
          : TimesheetStatus.APPROVED,
      billableMinutes,
      invoices: [
        {
          id: persisted.freelancerInvoice.id,
          number: persisted.freelancerInvoice.number,
          type: "SELF_BILL_FREELANCER",
          totalCents: persisted.billing.freelancerInvoice.totalCents,
          vatCents: persisted.billing.freelancerInvoice.vatCents,
        },
        {
          id: "-",
          number: persisted.billing.platformFeeInvoice.number,
          type: "PLATFORM_FEE",
          totalCents: persisted.billing.platformFeeInvoice.totalCents,
          vatCents: persisted.billing.platformFeeInvoice.vatCents,
        },
      ],
      payout: {
        paymentId: persisted.payment.id,
        status: payoutStatus,
        amountCents: persisted.payment.amountCents,
        endToEndId: persisted.payment.endToEndId,
        providerRef,
      },
      dba,
    };
  } finally {
    await unlock();
  }
}

async function persistInvoice(
  tx: Prisma.TransactionClient,
  invoice: ComputedInvoice,
) {
  return tx.invoice.create({
    data: {
      number: invoice.number,
      type: invoice.type,
      status: InvoiceStatus.ISSUED,
      issuedAt: new Date(),
      timesheetId: invoice.timesheetId,
      recipientTenantId: invoice.recipientTenantId,
      issuerTenantId: invoice.issuerTenantId ?? null,
      issuerFreelancerId: invoice.issuerFreelancerId ?? null,
      currency: "EUR",
      vatTreatment: invoice.vatTreatment,
      vatRate: invoice.vatRate,
      subtotalCents: invoice.subtotalCents,
      vatCents: invoice.vatCents,
      totalCents: invoice.totalCents,
      lines: {
        create: invoice.lines.map((l) => ({
          description: l.description,
          quantity: l.quantityHours,
          unitPriceCents: l.unitPriceCents,
          amountCents: l.amountCents,
        })),
      },
    },
  });
}
