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
import { recordPayout, recordTimesheetApproved } from "@/lib/metrics";
import { assertBranchAccess, type Principal } from "@/lib/auth";
import { nextInvoiceNumber } from "@/lib/billing/numbering";
import { buildReverseBillingInvoices, buildUitzendInvoice } from "@/lib/billing/self-billing";
import { applyPendingTenantCredits } from "@/lib/billing/credits";
import {
  isValidIban,
  payoutEndToEndId,
  triggerInstantPayout,
} from "@/lib/billing/sepa";
import { evaluateDbaCompliance } from "@/lib/compliance/dba";
import { evaluatePayoutGate } from "@/lib/billing/payout-gate";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { isoWeekOf, isoWeekId, isoWeekLabel } from "@/lib/payroll/week";
import { createPayrollAdvance } from "@/lib/payouts/advances";
import { creditEarning, getPayoutDestination } from "@/lib/bank/earnings";
import { dispatchPayout } from "@/lib/payouts/execute";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { rewardReferral } from "@/lib/rewards/referral";
import { getFastPay } from "@/lib/payouts/fastpay";
import { feePerHourFor, monthHoursFor, tierFor } from "@/lib/pricing/volume";
import { markupFor } from "@/lib/uitzendbureau/insights";
import { personalAccount } from "@/lib/bank/accounts";
import { evaluateTimesheetFraud } from "@/lib/fraud/timesheet";
import { dispatchWebhook } from "@/lib/webhooks/dispatcher";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { sendUserPush } from "@/lib/notifications/push";
import { sendMail, invoiceIssuedEmail } from "@/lib/mail";
import { recipientsFor } from "@/lib/billing/reminders";
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
  /**
   * "invoice" = ZZP / flexwerker: two reverse-billing invoices + instant SEPA
   * payout. "payroll" = uitzendkracht: one UITZEND_FEE invoice to the client
   * (gross wage + uitzendopslag); the worker's own pay flows into the weekly
   * payroll run and lands on a loonstrook, not an invoice.
   */
  track: "invoice" | "payroll";
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
  } | null;
  payroll: { isoWeekId: string; weekLabel: string } | null;
  /** payroll track only: the instant advance paid out within ~1 min */
  advance: { amountCents: number; netCents: number; feeCents: number; payoutStatus: string } | null;
  dba: { riskLevel: string; action: string } | null;
}

const MINUTE_MS = 60_000;

/**
 * Een goedkeuring/uitbetaling kan geblokkeerd worden doordat het profiel van de
 * freelancer niet compleet is (geen/ongeldig/onbevestigd rekeningnummer). De
 * werkgever ziet de melding al; dit laat de freelancer zélf weten dat hij z'n
 * profiel moet aanvullen. Best effort — nooit blokkerend.
 */
async function notifyFreelancerProfileIncomplete(userId: string, detail: string): Promise<void> {
  try {
    await sendUserPush([userId], {
      title: "Vul je gegevens aan om uitbetaald te worden",
      body: `Je uren kunnen nog niet goedgekeurd en uitbetaald worden: ${detail} Vul je profiel 100% in (o.a. je bankrekening/IBAN).`.slice(0, 180),
      data: { type: "PROFILE", url: "/dashboard/profiel", tag: "payout-incomplete" },
      ttlSeconds: 7 * 24 * 3600,
    });
  } catch {
    /* best effort */
  }
}

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

    const billableMinutes =
      input.correctedBillableMinutes ??
      (ts.billableMinutes > 0 ? ts.billableMinutes : computeBillableMinutes(ts));
    if (billableMinutes <= 0) {
      throw AppError.validation("Billable minutes must be positive");
    }

    // --- Fraude-/fouten-detectie -------------------------------------
    const fraudFlags = evaluateTimesheetFraud({
      scheduledStart: ts.scheduledStart,
      scheduledEnd: ts.scheduledEnd,
      actualStart: ts.actualStart,
      actualEnd: ts.actualEnd,
      breakMinutes: ts.breakMinutes,
      billableMinutes,
      gpsEvents: ts.gpsEvents,
      overlappingCount: await prisma.timesheet.count({
        where: {
          id: { not: ts.id },
          freelancerId: ts.freelancerId,
          status: { in: ["SUBMITTED", "APPROVED", "PAID", "DISPUTED"] },
          scheduledStart: { lt: ts.scheduledEnd },
          scheduledEnd: { gt: ts.scheduledStart },
        },
      }),
    });
    const blockingFraud = fraudFlags.filter(
      (f) => f.severity === "critical" && !["MOCK_GPS", "GEOFENCE_FAIL", "NO_CHECKIN"].includes(f.code),
    );
    if (blockingFraud.length > 0 && !input.overrideGpsCheck) {
      throw AppError.precondition(
        `Handmatige controle nodig: ${blockingFraud.map((f) => f.message).join(" ")}`,
      );
    }

    // --- Fork: uitzendkracht → payroll, everyone else → invoice + payout ---
    const fiscal = await getFiscal(ts.freelancer.userId);
    if (invoiceModeFor(fiscal) === "payroll") {
      return approveViaPayroll({ ts, principal, billableMinutes, input, log });
    }

    // --- Payout destination -------------------------------------------
    // Either the freelancer's own IBAN, or (their choice) their ZekerFlex
    // Bank account — then no IBAN is needed and the payout is instant.
    const toBank = (await getPayoutDestination(ts.freelancer.userId)) === "bank";
    const iban = toBank
      ? (await personalAccount(ts.freelancer.userId, ts.freelancer.user.fullName)).number
      : ts.freelancer.payoutIban;
    if (!toBank && (!iban || !isValidIban(iban))) {
      await notifyFreelancerProfileIncomplete(ts.freelancer.userId, "er staat nog geen geldig rekeningnummer (IBAN) op je profiel.");
      throw AppError.precondition(
        "De freelancer heeft nog geen geldig rekeningnummer (IBAN) ingevuld — de uren kunnen pas goedgekeurd en uitbetaald worden zodra het profiel 100% compleet is. De freelancer heeft hierover een melding gekregen.",
      );
    }
    if (!iban) {
      await notifyFreelancerProfileIncomplete(ts.freelancer.userId, "er is nog geen uitbetaalbestemming op je profiel ingesteld.");
      throw AppError.precondition("De freelancer heeft nog geen uitbetaalbestemming ingesteld. De freelancer heeft hierover een melding gekregen.");
    }
    // The freelancer recently changed their IBAN and hasn't re-verified it
    // with a fresh bank document yet (lib/compliance/documents.ts) — hold
    // the payout rather than silently sending money to a newly-added,
    // unverified account (e.g. after an account takeover).
    if (!toBank && ts.freelancer.payoutIbanPendingVerification) {
      await notifyFreelancerProfileIncomplete(ts.freelancer.userId, "je rekeningnummer is recent gewijzigd en nog niet geverifieerd.");
      throw AppError.precondition(
        "Rekeningnummer is recent gewijzigd en nog niet geverifieerd — de freelancer moet een bankafschrift uploaden voordat uitbetaald kan worden. De freelancer heeft hierover een melding gekregen.",
      );
    }

    const platformTenant = await prisma.tenant.findFirst({
      where: { type: "PLATFORM" },
      select: { id: true },
    });
    if (!platformTenant) {
      throw AppError.precondition("Platform tenant is not configured");
    }

    const payoutGate = evaluatePayoutGate({
      timesheetApproved: true,
      freelancerKvkValid: ts.freelancer.kvkValid,
      freelancerVatValid: ts.freelancer.vatValid,
      disputeOpen: ts.dispute !== null && ![
        "RESOLVED_APPROVED",
        "RESOLVED_OVERRULED",
      ].includes(ts.dispute.status),
    });
    if (!payoutGate.released) {
      throw AppError.precondition(
        `Payout geblokkeerd: ${payoutGate.reasons.join(", ")}`,
      );
    }

    // Staffelkorting: rate by hours this client already had approved this month.
    const monthHours = await monthHoursFor(ts.branch.tenantId);

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
        extraCostsGrossCents: ts.extraCostsCents,
        extraCostsNote: ts.extraCostsNote,
        platformFeePerHourCents: feePerHourFor(monthHours),
        volumeTierName: tierFor(monthHours).tier.name,
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
      const platformFeeInvoice = await persistInvoice(
        tx,
        billing.platformFeeInvoice,
      );
      await applyPendingTenantCredits(tx, ts.branch.tenantId, platformFeeInvoice.id, platformFeeInvoice.totalCents);

      const payment = await tx.payment.create({
        data: {
          invoiceId: freelancerInvoice.id,
          method: "SEPA_INSTANT",
          status: PaymentStatus.PENDING,
          amountCents: billing.freelancerPayoutCents,
          debtorIban: env.SEPA_CREDITOR_IBAN ?? null,
          creditorIban: iban,
          endToEndId: payoutEndToEndId(freelancerInvoice.id),
        },
      });

      return {
        timesheet: updated,
        freelancerInvoice,
        platformFeeInvoice,
        payment,
        billing,
      };
    });

    log.info("timesheet approved, invoices issued", {
      freelancerInvoice: persisted.freelancerInvoice.number,
      payoutCents: persisted.billing.freelancerPayoutCents,
    });

    // --- Payout (outside the DB transaction) ---------------------------
    // Per the money model: instant (4%) / 3 working days (2%) only when this
    // client offers fast payout and the freelancer accepted the terms;
    // otherwise paid in full once the client pays. The client's invoice
    // stays open either way — it's ZekerFlex that gets paid by the client.
    const dispatched = await dispatchPayout({
      paymentId: persisted.payment.id,
      invoiceId: persisted.freelancerInvoice.id,
      userId: ts.freelancer.userId,
      tenantId: ts.branch.tenantId,
      amountCents: persisted.payment.amountCents,
    });
    const payoutStatus = dispatched.status;
    const providerRef = dispatched.providerRef;
    if (payoutStatus === PaymentStatus.FAILED) log.error("payout failed; queued for retry", { paymentId: persisted.payment.id });

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
        fraudFlags: fraudFlags.map((f) => `${f.severity}:${f.code}`),
        freelancerId: ts.freelancerId,
        freelancerInvoice: persisted.freelancerInvoice.number,
        payoutStatus,
        payoutCents: persisted.payment.amountCents,
        resolvedDisputeId: ts.dispute?.id ?? null,
      },
    });

    await rewardReferralsAfterApproval(ts.freelancer.userId, ts.freelancer.user.fullName, principal);

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

    recordTimesheetApproved("invoice");
    recordPayout(String(payoutStatus));

    void dispatchWebhook("timesheet.approved", ts.branch.tenantId, {
      timesheetId: ts.id,
      billableMinutes,
      track: "invoice",
    }).catch(() => undefined);
    void dispatchWebhook("invoice.issued", ts.branch.tenantId, {
      invoiceId: persisted.platformFeeInvoice.id,
      number: persisted.platformFeeInvoice.number,
      type: "PLATFORM_FEE",
      totalCents: persisted.billing.platformFeeInvoice.totalCents,
    }).catch(() => undefined);

    await notifyInvoiceIssued({
      tenantId: ts.branch.tenantId,
      orgName: ts.branch.tenant.name,
      invoiceNumber: persisted.platformFeeInvoice.number,
      totalCents: persisted.billing.platformFeeInvoice.totalCents,
      description: `platformkosten, shift @ ${ts.branch.name}`,
      log,
    });

    return {
      timesheetId: ts.id,
      status:
        payoutStatus === PaymentStatus.SETTLED
          ? TimesheetStatus.PAID
          : TimesheetStatus.APPROVED,
      billableMinutes,
      track: "invoice",
      payroll: null,
      advance: null,
      invoices: [
        {
          id: persisted.freelancerInvoice.id,
          number: persisted.freelancerInvoice.number,
          type: "SELF_BILL_FREELANCER",
          totalCents: persisted.billing.freelancerInvoice.totalCents,
          vatCents: persisted.billing.freelancerInvoice.vatCents,
        },
        {
          id: persisted.platformFeeInvoice.id,
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

/**
 * Uitzendkracht track: no invoice, no instant SEPA. The timesheet is marked
 * APPROVED so the weekly payroll run (`lib/payroll/engine.ts`) picks it up and
 * turns it into a loonstrook with loonheffing, vakantiegeld etc.
 */
/**
 * Doorverwijzen: an approved klus is the "first real activity" for both the
 * freelancer who worked it and the employer who approved it. Best effort.
 */
async function rewardReferralsAfterApproval(freelancerUserId: string, freelancerName: string, approver: Principal): Promise<void> {
  try {
    await rewardReferral(freelancerUserId, await personalAccount(freelancerUserId, freelancerName));
    await rewardReferral(approver.userId, (await accountForPrincipal(approver)).account);
  } catch (err) {
    logger.warn("referral reward after approval failed", { error: (err as Error).message });
  }
}

async function approveViaPayroll(args: {
  ts: {
    id: string;
    branchId: string;
    scheduledStart: Date;
    hourlyRateCents: number;
    branch: { name: string; tenantId: string; tenant: { name: string; country: string } };
    freelancerId: string;
    freelancer: {
      userId: string;
      payoutIban: string | null;
      payoutIbanPendingVerification: boolean;
      stripeConnectedAccountId: string | null;
      stripePayoutsEnabled: boolean;
      user: { fullName: string };
    };
    dispute: { id: string; status: string } | null;
  };
  principal: Principal;
  billableMinutes: number;
  input: ApproveTimesheetInput;
  log: ReturnType<typeof logger.child>;
}): Promise<ApproveTimesheetResult> {
  const { ts, principal, billableMinutes, input, log } = args;
  const week = isoWeekOf(ts.scheduledStart);
  const weekId = isoWeekId(week);
  const weekLabel = isoWeekLabel(week);
  const expectedGrossCents = Math.round((billableMinutes / 60) * ts.hourlyRateCents);

  const platformTenant = await prisma.tenant.findFirst({
    where: { type: "PLATFORM" },
    select: { id: true },
  });
  if (!platformTenant) {
    throw AppError.precondition("Platform tenant is not configured");
  }

  // The opslag agreed with this client (falls back to the default rate).
  const markupRate = await markupFor(ts.branch.tenantId);
  const { uitzendInvoice } = await prisma.$transaction(async (tx) => {
    await tx.timesheet.update({
      where: { id: ts.id },
      data: {
        status: TimesheetStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: principal.userId,
        billableMinutes,
      },
    });
    if (
      ts.dispute &&
      ts.dispute.status !== "RESOLVED_APPROVED" &&
      ts.dispute.status !== "RESOLVED_OVERRULED"
    ) {
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
          resolutionNote: input.correctionNote ?? "Resolved during timesheet approval",
        },
      });
    }

    const invoiceNumber = await nextInvoiceNumber(tx, "UITZEND_FEE");
    const computed = buildUitzendInvoice({
      timesheetId: ts.id,
      billableMinutes,
      hourlyRateCents: ts.hourlyRateCents,
      recipientTenantId: ts.branch.tenantId,
      recipientCountry: ts.branch.tenant.country,
      platformTenantId: platformTenant.id,
      shiftTitle: `Shift @ ${ts.branch.name}`,
      workedOn: ts.scheduledStart,
      invoiceNumber,
      markupRate,
    });
    const uitzendInvoice = await persistInvoice(tx, computed);
    return { uitzendInvoice };
  });

  // Instant advance payout (~50% of expected gross) within ~1 min — reconciled
  // by the weekly payroll run. Best effort: never blocks the approval. Also
  // held while a recent IBAN change hasn't been re-verified (same reasoning
  // as the invoice track's hard block above) — the full balance still
  // arrives normally once SEPA export (lib/payroll/sepa-export.ts) resumes.
  let advance: ApproveTimesheetResult["advance"] = null;
  try {
    if (ts.freelancer.payoutIbanPendingVerification) {
      throw new Error("IBAN recent gewijzigd, nog niet geverifieerd — voorschot aangehouden");
    }
    // The client decides whether its uitzendkrachten get an instant advance.
    if (!(await getFastPay(ts.branch.tenantId)).advancesForUitzend) {
      throw new Error("Opdrachtgever biedt geen voorschot voor uitzendkrachten — loon volgt via de wekelijkse verloning");
    }
    const a = await createPayrollAdvance({
      userId: ts.freelancer.userId,
      workerName: ts.freelancer.user.fullName,
      timesheetId: ts.id,
      isoWeek: weekId,
      expectedGrossCents,
      creditorIban: ts.freelancer.payoutIban,
      stripeConnectedAccountId: ts.freelancer.stripePayoutsEnabled
        ? ts.freelancer.stripeConnectedAccountId
        : null,
    });
    if (a) {
      advance = {
        amountCents: a.amountCents,
        netCents: a.netCents,
        feeCents: a.feeCents,
        payoutStatus: a.payoutStatus ?? "PENDING",
      };
    }
  } catch (err) {
    log.warn("payroll advance failed", { error: (err as Error).message });
  }

  log.info("timesheet approved (payroll track)", { isoWeek: weekId, billableMinutes, advanceCents: advance?.amountCents ?? 0 });

  await recordAudit({
    category: "TIMESHEET",
    action: "timesheet.approved",
    actorUserId: principal.userId,
    actorLabel: "user",
    severity: input.overrideGpsCheck ? "warning" : "info",
    summary: `Urenbriefje ${ts.id} goedgekeurd (${billableMinutes} min) - verloning via payroll, week ${weekLabel}`,
    targetType: "timesheet",
    targetId: ts.id,
    metadata: {
      track: "payroll",
      billableMinutes,
      correctedBillableMinutes: input.correctedBillableMinutes ?? null,
      overrodeGpsCheck: Boolean(input.overrideGpsCheck),
      freelancerId: ts.freelancerId,
      isoWeek: weekId,
      resolvedDisputeId: ts.dispute?.id ?? null,
    },
  });

  recordTimesheetApproved("payroll");

  void dispatchWebhook("timesheet.approved", ts.branch.tenantId, {
    timesheetId: ts.id,
    billableMinutes,
    track: "payroll",
  }).catch(() => undefined);
  void dispatchWebhook("invoice.issued", ts.branch.tenantId, {
    invoiceId: uitzendInvoice.id,
    number: uitzendInvoice.number,
    type: "UITZEND_FEE",
    totalCents: uitzendInvoice.totalCents,
  }).catch(() => undefined);

  await notifyInvoiceIssued({
    tenantId: ts.branch.tenantId,
    orgName: ts.branch.tenant.name,
    invoiceNumber: uitzendInvoice.number,
    totalCents: uitzendInvoice.totalCents,
    description: `uitzendkracht-uren, week ${weekLabel}`,
    log,
    from: env.MAIL_UITZEND_FROM,
  });

  await rewardReferralsAfterApproval(ts.freelancer.userId, ts.freelancer.user.fullName, principal);

  return {
    timesheetId: ts.id,
    status: TimesheetStatus.APPROVED,
    billableMinutes,
    track: "payroll",
    invoices: [
      {
        id: uitzendInvoice.id,
        number: uitzendInvoice.number,
        type: "UITZEND_FEE",
        totalCents: uitzendInvoice.totalCents,
        vatCents: uitzendInvoice.vatCents,
      },
    ],
    payout: null,
    payroll: { isoWeekId: weekId, weekLabel },
    advance,
    dba: null,
  };
}

/**
 * Best-effort "nieuwe factuur" mail to the tenant's billing contact. Never
 * blocks or rolls back the approval — a mail failure (or a tenant with no
 * billingEmail set) is logged and swallowed, same as the instant-advance
 * payout above.
 */
async function notifyInvoiceIssued(args: {
  tenantId: string;
  orgName: string;
  invoiceNumber: string;
  totalCents: number;
  description: string;
  log: ReturnType<typeof logger.child>;
  from?: string;
}): Promise<void> {
  try {
    // Billing address if set, otherwise the company's admins — before this, no
    // billing address meant no invoice mail at all.
    const to = await recipientsFor(args.tenantId);
    if (to.length === 0) return;
    const mail = invoiceIssuedEmail(
      args.orgName,
      `${env.APP_BASE_URL.replace(/\/+$/, "")}/werkgever/facturen`,
      args.invoiceNumber,
      args.totalCents,
      args.description,
    );
    for (const addr of to) await sendMail({ ...mail, to: addr, ...(args.from ? { from: args.from } : {}) });
  } catch (err) {
    args.log.warn("invoice-issued mail failed", { error: (err as Error).message, invoiceNumber: args.invoiceNumber });
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
