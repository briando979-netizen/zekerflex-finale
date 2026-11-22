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
import { buildPlatformFeeInvoice, buildReverseBillingInvoices, buildUitzendInvoice } from "@/lib/billing/self-billing";
import { isUitzendPartnerTenant } from "@/lib/uitzend/partners";
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
import { isCompTenant } from "@/lib/billing/comp";
import { introductieZonderFee } from "@/lib/introducties/vrijstelling";
import { INTRODUCTIE_FEE_REDEN } from "@/lib/introducties/periode";
import { EERSTE_MAAND_GRATIS_VLAG, PARTNERDEAL_FEE_REDEN, partnerdealZonderFee, startEersteMaandGratis } from "@/lib/billing/partnerdeal-vrij";
import { featureEnabled } from "@/lib/flags";
import { markupFor } from "@/lib/uitzendbureau/insights";
import { personalAccount } from "@/lib/bank/accounts";
import { evaluateTimesheetFraud } from "@/lib/fraud/timesheet";
import { incheckenVereist } from "@/lib/checkin/vereist";
import { zonderInchecken } from "@/lib/checkin/vereist-kern";
import { dispatchWebhook } from "@/lib/webhooks/dispatcher";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { eenmaligPush } from "@/lib/notifications/push-eenmalig";
import { WERKER_BEDRIJF_MIST } from "@/lib/timesheets/bulk-goedkeuren";
import { bedrijfOk, btwGeldig, korZonderBtw } from "@/lib/fiscal/bedrijf-ok";
import { urenBedrijfMistEmailT } from "@/lib/mail/werker/uren-bedrijf-mist";
import { mailTaalVoorWerker } from "@/lib/mail/taal";
import { efactuurNaUitgifte } from "@/lib/efactuur/bezorging";
import { pushHoursApproved } from "@/lib/notifications/approved-push";
import { runAfter } from "@/lib/run-after";
import { sendMail, invoiceIssuedEmail } from "@/lib/mail";
import { recipientsFor } from "@/lib/billing/reminders";
import { betaaltermijnTekst, vervaldatumVoor, type TermijnFactuur } from "@/lib/billing/betaaltermijn";
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
   * "partner" = klus van een uitzendpartner (lib/uitzend/partners-kern.ts): het bureau is de werkgever en betaalt het loon;
   * ZekerFlex stuurt het bureau alleen de PLATFORM_FEE-factuur, zonder uitbetaling en zonder loonstrook.
   */
  track: "invoice" | "payroll" | "partner";
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
  /** payroll track only: the advance payout instruction status */
  advance: { amountCents: number; netCents: number; feeCents: number; payoutStatus: string } | null;
  dba: { riskLevel: string; action: string } | null;
}

const MINUTE_MS = 60_000;

/** Achter de samenvatting in het auditspoor als de uren zonder inchecken zijn ingediend (lib/checkin/vereist.ts). */
const ZONDER_INCHECKEN_AUDIT = " (zonder inchecken ingediend, goedgekeurd door het bedrijf)";

/**
 * Een goedkeuring/uitbetaling kan geblokkeerd worden doordat het profiel van de
 * freelancer niet compleet is (geen/ongeldig/onbevestigd rekeningnummer). De
 * werkgever ziet de melding al; dit laat de freelancer zélf weten dat hij z'n
 * profiel moet aanvullen. Best effort — nooit blokkerend.
 */
async function notifyFreelancerProfileIncomplete(userId: string, reason: "iban" | "dest" | "pending"): Promise<void> {
  try {
    // aan een werker: in zijn app-taal (WORKER_PUSH)
    await sendLocalizedPush([userId], (t) => ({
      title: t.payoutIncompleteTitle,
      body: t.payoutIncompleteBody(reason).slice(0, 180),
      data: { type: "PROFILE", url: "/dashboard/profiel", tag: "payout-incomplete" },
      ttlSeconds: 7 * 24 * 3600,
    }));
  } catch {
    /* best effort */
  }
}

/**
 * Hetzelfde voor een werker zonder geldig KVK- of btw-nummer en zonder KOR: tot 21 nov hoorde de werker daar niets van en
 * bleven zijn uren stil liggen. Eén keer per urenbriefje (de automatische goedkeuring en de werkgever proberen het vaker); een
 * storing in de markering = gewoon sturen. De werkgever leest "We hebben hem een bericht gestuurd" (WERKER_BEDRIJF_MIST):
 * daarom naast de push (alleen met meldingen aan) ook altijd een mail, in de app-taal van de werker. Push en mail staan los
 * van elkaar: valt de een weg, dan gaat de ander toch. Best effort, nooit blokkerend.
 */
async function notifyFreelancerBedrijfMist(
  werker: { userId: string; email: string | null; fullName: string },
  timesheetId: string,
): Promise<void> {
  const { userId } = werker;
  const pad = "/dashboard/verificatie#gegevens-later-kop";
  try {
    if (!(await eenmaligPush("uren-bedrijf", timesheetId, userId))) return;
  } catch {
    /* een storing in de markering: gewoon sturen */
  }
  try {
    await sendLocalizedPush([userId], (t) => ({
      title: t.payoutBedrijfTitle,
      body: t.payoutBedrijfBody.slice(0, 180),
      data: { type: "PROFILE", url: pad, tag: "payout-bedrijf" },
      ttlSeconds: 7 * 24 * 3600,
    }));
  } catch {
    /* best effort: de mail gaat toch */
  }
  if (!werker.email) return;
  try {
    const mail = urenBedrijfMistEmailT(werker.fullName, `${env.APP_BASE_URL.replace(/\/+$/, "")}${pad}`, await mailTaalVoorWerker(userId));
    await sendMail({ ...mail, to: werker.email });
  } catch (err) {
    logger.warn("uren-bedrijf-mist: mail mislukt", { timesheetId, error: (err as Error).message });
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
  const result = await approveTimesheetInner(input);
  // Tell the worker right away (every caller: employer, bulk, autopilot, dispute).
  runAfter(() => pushHoursApproved(result));
  return result;
}

async function approveTimesheetInner(
  input: ApproveTimesheetInput,
): Promise<ApproveTimesheetResult> {
  const { timesheetId, principal } = input;
  const log = logger.child({ timesheetId, module: "timesheet-approve" });

  const unlock = await acquireLock(`timesheet:approve:${timesheetId}`, 20_000);
  if (!unlock) throw AppError.conflict("Goedkeuren is al bezig.");

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
    if (!ts) throw AppError.notFound("Urenbriefje niet gevonden.");

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
    // Inchecken uit bij dit bedrijf (lib/checkin/vereist.ts) en ook niet ingecheckt: er is geen bewijs van aanwezigheid om te
    // controleren, de goedkeuring van het bedrijf zelf is het bewijs. Een check-in die er toch is, wordt gewoon gecontroleerd.
    const incheckVereist = await incheckenVereist(ts.branch.tenantId);
    const zonderCheckin = zonderInchecken(incheckVereist, Boolean(checkIn));
    if (!input.overrideGpsCheck && !zonderCheckin) {
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
      throw AppError.validation("Het aantal uren moet groter dan 0 zijn.");
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
      incheckenVereist: incheckVereist,
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

    // --- Uitzendpartner: het bureau is werkgever en betaalt het loon; ZekerFlex rekent alleen de platformkosten ---
    // Vóór de keuze op de werker: ook een uitzendkracht of zzp'er die bij een partner werkte, krijgt van ZekerFlex geen
    // uitbetaling, geen factuur op zijn naam en geen loonstrook (lib/payroll/engine.ts slaat deze briefjes ook over).
    if (await isUitzendPartnerTenant(ts.branch.tenantId)) {
      return approveViaPartner({ ts, principal, billableMinutes, input, log, zonderCheckin });
    }

    // --- Fork: uitzendkracht → payroll, everyone else → invoice + payout ---
    const fiscal = await getFiscal(ts.freelancer.userId);
    if (invoiceModeFor(fiscal) === "payroll") {
      return approveViaPayroll({ ts, principal, billableMinutes, input, log, zonderCheckin });
    }

    // --- Payout destination -------------------------------------------
    // Either the freelancer's own IBAN, or (their choice) their ZekerFlex
    // Bank account — then no IBAN is needed and the payout is instant.
    const toBank = (await getPayoutDestination(ts.freelancer.userId)) === "bank";
    const iban = toBank
      ? (await personalAccount(ts.freelancer.userId, ts.freelancer.user.fullName)).number
      : ts.freelancer.payoutIban;
    if (!toBank && (!iban || !isValidIban(iban))) {
      await notifyFreelancerProfileIncomplete(ts.freelancer.userId, "iban");
      throw AppError.precondition(
        "De freelancer heeft nog geen geldig rekeningnummer (IBAN) ingevuld — de uren kunnen pas goedgekeurd en uitbetaald worden zodra het profiel 100% compleet is. De freelancer heeft hierover een melding gekregen.",
      );
    }
    if (!iban) {
      await notifyFreelancerProfileIncomplete(ts.freelancer.userId, "dest");
      throw AppError.precondition("De freelancer heeft nog geen uitbetaalbestemming ingesteld. De freelancer heeft hierover een melding gekregen.");
    }
    // The freelancer recently changed their IBAN and hasn't re-verified it
    // with a fresh bank document yet (lib/compliance/documents.ts) — hold
    // the payout rather than silently sending money to a newly-added,
    // unverified account (e.g. after an account takeover).
    if (!toBank && ts.freelancer.payoutIbanPendingVerification) {
      await notifyFreelancerProfileIncomplete(ts.freelancer.userId, "pending");
      throw AppError.precondition(
        "Rekeningnummer is recent gewijzigd en nog niet geverifieerd — de freelancer moet een bankafschrift uploaden voordat uitbetaald kan worden. De freelancer heeft hierover een melding gekregen.",
      );
    }

    const platformTenant = await prisma.tenant.findFirst({
      where: { type: "PLATFORM" },
      select: { id: true },
    });
    if (!platformTenant) {
      throw AppError.precondition("De platformorganisatie is niet ingesteld.");
    }

    // Bedrijf ok met dezelfde regel als reageren (lib/fiscal/bedrijf-ok.ts): KVK, óf btw (profiel of fiscale gegevens), óf de
    // KOR. Tot 21 nov eiste deze poort KVK én btw: een werker met de KOR of met alleen een EU-btw-nummer kon dan wel werken,
    // maar nooit uitbetaald worden.
    const btwOk = btwGeldig(ts.freelancer, fiscal);
    const payoutGate = evaluatePayoutGate({
      timesheetApproved: true,
      freelancerKvkValid: ts.freelancer.kvkValid,
      freelancerVatValid: btwOk,
      freelancerKor: Boolean(fiscal.korApplies),
      disputeOpen: ts.dispute !== null && ![
        "RESOLVED_APPROVED",
        "RESOLVED_OVERRULED",
      ].includes(ts.dispute.status),
    });
    if (!payoutGate.released) {
      // Geen KVK, btw of KOR (bijv. na een proefklus, lib/fiscal/proefklussen-kern.ts): de poort blijft dicht, maar de
      // werker hoort het nu zelf (één keer per urenbriefje, push én mail) en de werkgever leest een gewone zin.
      if (!bedrijfOk(ts.freelancer, fiscal)) {
        await notifyFreelancerBedrijfMist({ userId: ts.freelancer.userId, email: ts.freelancer.user.email, fullName: ts.freelancer.user.fullName }, ts.id);
        throw AppError.precondition(WERKER_BEDRIJF_MIST);
      }
      throw AppError.precondition(
        `Payout geblokkeerd: ${payoutGate.reasons.join(", ")}`,
      );
    }

    // Staffelkorting: rate by hours this client already had approved this month.
    const monthHours = await monthHoursFor(ts.branch.tenantId);
    // A free (comp) company pays no platform fee; its € 0 fee invoice is booked as paid.
    const freeFee = await isCompTenant(ts.branch.tenantId);
    // "Introduceer een bedrijf" (lib/introducties): de eerste twee weken na het koppelen geen platformkosten, naar de dag
    // van de dienst in Amsterdam. Dezelfde € 0-factuur als hierboven, met de reden op de regel; elk ander bedrijf: niets anders.
    const introductieVrij = !freeFee && (await introductieZonderFee(ts.branch.tenantId, ts.scheduledStart));
    // Eerste maand gratis (21 nov 2026): bij de eerste dienst van een bedrijf zonder gratis maand begint die vanzelf
    if (!freeFee && !introductieVrij) await eersteMaandGratisAlsAan(ts.branch.tenantId, ts.branch.tenant.name, ts.scheduledStart);
    // De gratis maand van de Partnerdeal (lib/billing/partnerdeal-vrij.ts): 30 dagen vanaf de dag dat de eigenaar hem gaf.
    const partnerdealVrij = !freeFee && !introductieVrij && (await partnerdealZonderFee(ts.branch.tenantId, ts.scheduledStart));

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
        freelancerVatValid: btwOk,
        // KOR: geen btw op de factuur op naam van de werker, met de vermelding (lib/billing/self-billing.ts)
        freelancerKor: korZonderBtw(fiscal, btwOk),
        recipientTenantId: ts.branch.tenantId,
        recipientCountry: ts.branch.tenant.country,
        platformTenantId: platformTenant.id,
        shiftTitle: `Shift @ ${ts.branch.name}`,
        workedOn: ts.scheduledStart,
        freelancerInvoiceNumber: freelancerNumber,
        platformInvoiceNumber: platformNumber,
        extraCostsGrossCents: ts.extraCostsCents,
        extraCostsNote: ts.extraCostsNote,
        platformFeePerHourCents: freeFee || introductieVrij || partnerdealVrij ? 0 : feePerHourFor(monthHours),
        volumeTierName: tierFor(monthHours).tier.name,
        ...(introductieVrij ? { platformFeeReden: INTRODUCTIE_FEE_REDEN } : {}),
        ...(partnerdealVrij ? { platformFeeReden: PARTNERDEAL_FEE_REDEN } : {}),
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
        { paid: billing.platformFeeInvoice.totalCents === 0 },
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
      summary: `Urenbriefje ${ts.id} goedgekeurd (${billableMinutes} min) - ${ts.branch.name}${zonderCheckin ? ZONDER_INCHECKEN_AUDIT : ""}`,
      targetType: "timesheet",
      targetId: ts.id,
      metadata: {
        billableMinutes,
        correctedBillableMinutes: input.correctedBillableMinutes ?? null,
        overrodeGpsCheck: Boolean(input.overrideGpsCheck),
        zonderInchecken: zonderCheckin,
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
    }).catch((err) => logger.warn("webhook-aflevering mislukt", { event: "timesheet.approved", tenantId: ts.branch.tenantId, error: (err as Error).message }));
    void dispatchWebhook("invoice.issued", ts.branch.tenantId, {
      invoiceId: persisted.platformFeeInvoice.id,
      number: persisted.platformFeeInvoice.number,
      type: "PLATFORM_FEE",
      totalCents: persisted.billing.platformFeeInvoice.totalCents,
    }).catch((err) => logger.warn("webhook-aflevering mislukt", { event: "invoice.issued", tenantId: ts.branch.tenantId, error: (err as Error).message }));

    // nothing to pay (free company): no "new invoice" mail
    if (persisted.billing.platformFeeInvoice.totalCents > 0) {
      await notifyInvoiceIssued({
        tenantId: ts.branch.tenantId,
        orgName: ts.branch.tenant.name,
        invoiceNumber: persisted.platformFeeInvoice.number,
        totalCents: persisted.billing.platformFeeInvoice.totalCents,
        description: `platformkosten, shift @ ${ts.branch.name}`,
        termijn: persisted.platformFeeInvoice,
        log,
      });
      // e-factuur (UBL/Peppol) als het bedrijf dat aan heeft staan; nooit blokkerend
      void efactuurNaUitgifte(persisted.platformFeeInvoice.id, ts.branch.tenantId);
    }
    void efactuurNaUitgifte(persisted.freelancerInvoice.id, ts.branch.tenantId);

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
 * Klus van een uitzendpartner (lib/uitzend/partners-kern.ts): het bureau is de werkgever en regelt het loon zelf. Het
 * urenbriefje wordt goedgekeurd en het bureau krijgt alleen de PLATFORM_FEE-factuur (met dezelfde staffel, gratis
 * bedrijven, introductie- en partnerdeal-vrijstelling als het factuurspoor). Geen IBAN-controle, geen factuur op naam
 * van de werker, geen uitbetaling, geen voorschot.
 */
async function approveViaPartner(args: {
  ts: {
    id: string;
    branchId: string;
    scheduledStart: Date;
    branch: { name: string; tenantId: string; tenant: { name: string; country: string; vatNumber: string | null } };
    freelancerId: string;
    freelancer: { userId: string; user: { fullName: string } };
    dispute: { id: string; status: string } | null;
  };
  principal: Principal;
  billableMinutes: number;
  input: ApproveTimesheetInput;
  log: ReturnType<typeof logger.child>;
  zonderCheckin: boolean;
}): Promise<ApproveTimesheetResult> {
  const { ts, principal, billableMinutes, input, log, zonderCheckin } = args;

  const platformTenant = await prisma.tenant.findFirst({ where: { type: "PLATFORM" }, select: { id: true } });
  if (!platformTenant) throw AppError.precondition("De platformorganisatie is niet ingesteld.");

  // dezelfde fee-regels als het factuurspoor
  const monthHours = await monthHoursFor(ts.branch.tenantId);
  const freeFee = await isCompTenant(ts.branch.tenantId);
  const introductieVrij = !freeFee && (await introductieZonderFee(ts.branch.tenantId, ts.scheduledStart));
  if (!freeFee && !introductieVrij) await eersteMaandGratisAlsAan(ts.branch.tenantId, ts.branch.tenant.name, ts.scheduledStart);
  const partnerdealVrij = !freeFee && !introductieVrij && (await partnerdealZonderFee(ts.branch.tenantId, ts.scheduledStart));

  const { feeInvoice, computed } = await prisma.$transaction(async (tx) => {
    await tx.timesheet.update({
      where: { id: ts.id },
      data: { status: TimesheetStatus.APPROVED, approvedAt: new Date(), approvedById: principal.userId, billableMinutes },
    });
    if (ts.dispute && ts.dispute.status !== "RESOLVED_APPROVED" && ts.dispute.status !== "RESOLVED_OVERRULED") {
      await tx.dispute.update({
        where: { id: ts.dispute.id },
        data: {
          status: input.correctedBillableMinutes === undefined ? "RESOLVED_APPROVED" : "RESOLVED_OVERRULED",
          resolvedMinutes: billableMinutes,
          resolvedById: principal.userId,
          resolvedAt: new Date(),
          resolutionNote: input.correctionNote ?? "Resolved during timesheet approval",
        },
      });
    }
    const computed = buildPlatformFeeInvoice({
      timesheetId: ts.id,
      billableMinutes,
      recipientTenantId: ts.branch.tenantId,
      recipientCountry: ts.branch.tenant.country,
      recipientVatValidForReverseCharge: Boolean(ts.branch.tenant.vatNumber),
      platformTenantId: platformTenant.id,
      shiftTitle: `Shift @ ${ts.branch.name}`,
      invoiceNumber: await nextInvoiceNumber(tx, "PLATFORM_FEE"),
      platformFeePerHourCents: freeFee || introductieVrij || partnerdealVrij ? 0 : feePerHourFor(monthHours),
      volumeTierName: tierFor(monthHours).tier.name,
      ...(introductieVrij ? { platformFeeReden: INTRODUCTIE_FEE_REDEN } : {}),
      ...(partnerdealVrij ? { platformFeeReden: PARTNERDEAL_FEE_REDEN } : {}),
    });
    const feeInvoice = await persistInvoice(tx, computed, { paid: computed.totalCents === 0 });
    await applyPendingTenantCredits(tx, ts.branch.tenantId, feeInvoice.id, computed.totalCents);
    return { feeInvoice, computed };
  });

  log.info("timesheet approved (uitzendpartner)", { billableMinutes, feeInvoice: feeInvoice.number });

  await recordAudit({
    category: "TIMESHEET",
    action: "timesheet.approved",
    actorUserId: principal.userId,
    actorLabel: "user",
    severity: input.overrideGpsCheck ? "warning" : "info",
    summary: `Urenbriefje ${ts.id} goedgekeurd (${billableMinutes} min) - uitzendpartner ${ts.branch.tenant.name} betaalt het loon${zonderCheckin ? ZONDER_INCHECKEN_AUDIT : ""}`,
    targetType: "timesheet",
    targetId: ts.id,
    metadata: {
      track: "partner",
      billableMinutes,
      correctedBillableMinutes: input.correctedBillableMinutes ?? null,
      overrodeGpsCheck: Boolean(input.overrideGpsCheck),
      zonderInchecken: zonderCheckin,
      freelancerId: ts.freelancerId,
      platformFeeInvoice: feeInvoice.number,
      resolvedDisputeId: ts.dispute?.id ?? null,
    },
  });

  recordTimesheetApproved("partner");

  void dispatchWebhook("timesheet.approved", ts.branch.tenantId, { timesheetId: ts.id, billableMinutes, track: "partner" }).catch((err) =>
    logger.warn("webhook-aflevering mislukt", { event: "timesheet.approved", tenantId: ts.branch.tenantId, error: (err as Error).message }),
  );
  void dispatchWebhook("invoice.issued", ts.branch.tenantId, {
    invoiceId: feeInvoice.id,
    number: feeInvoice.number,
    type: "PLATFORM_FEE",
    totalCents: computed.totalCents,
  }).catch((err) => logger.warn("webhook-aflevering mislukt", { event: "invoice.issued", tenantId: ts.branch.tenantId, error: (err as Error).message }));

  if (computed.totalCents > 0) {
    await notifyInvoiceIssued({
      tenantId: ts.branch.tenantId,
      orgName: ts.branch.tenant.name,
      invoiceNumber: feeInvoice.number,
      totalCents: computed.totalCents,
      description: `platformkosten, shift @ ${ts.branch.name}`,
      termijn: feeInvoice,
      log,
    });
    void efactuurNaUitgifte(feeInvoice.id, ts.branch.tenantId);
  }

  return {
    timesheetId: ts.id,
    status: TimesheetStatus.APPROVED,
    billableMinutes,
    track: "partner",
    invoices: [{ id: feeInvoice.id, number: feeInvoice.number, type: "PLATFORM_FEE", totalCents: computed.totalCents, vatCents: computed.vatCents }],
    payout: null,
    payroll: null,
    advance: null,
    dba: null,
  };
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
  zonderCheckin: boolean;
}): Promise<ApproveTimesheetResult> {
  const { ts, principal, billableMinutes, input, log, zonderCheckin } = args;
  const week = isoWeekOf(ts.scheduledStart);
  const weekId = isoWeekId(week);
  const weekLabel = isoWeekLabel(week);
  const expectedGrossCents = Math.round((billableMinutes / 60) * ts.hourlyRateCents);

  const platformTenant = await prisma.tenant.findFirst({
    where: { type: "PLATFORM" },
    select: { id: true },
  });
  if (!platformTenant) {
    throw AppError.precondition("De platformorganisatie is niet ingesteld.");
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
    summary: `Urenbriefje ${ts.id} goedgekeurd (${billableMinutes} min) - verloning via payroll, week ${weekLabel}${zonderCheckin ? ZONDER_INCHECKEN_AUDIT : ""}`,
    targetType: "timesheet",
    targetId: ts.id,
    metadata: {
      track: "payroll",
      billableMinutes,
      correctedBillableMinutes: input.correctedBillableMinutes ?? null,
      overrodeGpsCheck: Boolean(input.overrideGpsCheck),
      zonderInchecken: zonderCheckin,
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
  }).catch((err) => logger.warn("webhook-aflevering mislukt", { event: "timesheet.approved", tenantId: ts.branch.tenantId, error: (err as Error).message }));
  void dispatchWebhook("invoice.issued", ts.branch.tenantId, {
    invoiceId: uitzendInvoice.id,
    number: uitzendInvoice.number,
    type: "UITZEND_FEE",
    totalCents: uitzendInvoice.totalCents,
  }).catch((err) => logger.warn("webhook-aflevering mislukt", { event: "invoice.issued", tenantId: ts.branch.tenantId, error: (err as Error).message }));

  await notifyInvoiceIssued({
    tenantId: ts.branch.tenantId,
    orgName: ts.branch.tenant.name,
    invoiceNumber: uitzendInvoice.number,
    totalCents: uitzendInvoice.totalCents,
    description: `uitzendkracht-uren, week ${weekLabel}`,
    termijn: uitzendInvoice,
    log,
    from: env.MAIL_UITZEND_FROM,
  });
  void efactuurNaUitgifte(uitzendInvoice.id, ts.branch.tenantId);

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
  /** de zojuist bewaarde factuur: de mail noemt zijn betaaltermijn */
  termijn: TermijnFactuur;
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
      betaaltermijnTekst(args.termijn),
    );
    for (const addr of to) await sendMail({ ...mail, to: addr, ...(args.from ? { from: args.from } : {}) });
  } catch (err) {
    args.log.warn("invoice-issued mail failed", { error: (err as Error).message, invoiceNumber: args.invoiceNumber });
  }
}

async function persistInvoice(
  tx: Prisma.TransactionClient,
  invoice: ComputedInvoice,
  opts: { paid?: boolean } = {},
) {
  const now = new Date();
  return tx.invoice.create({
    data: {
      number: invoice.number,
      type: invoice.type,
      // a € 0 platform fee (free company) has nothing to collect: paid at once
      status: opts.paid ? InvoiceStatus.PAID : InvoiceStatus.ISSUED,
      issuedAt: now,
      // werkerfactuur binnen 30 dagen, platformfactuur binnen 14 (lib/billing/betaaltermijn.ts)
      dueAt: vervaldatumVoor(invoice.type, now),
      ...(opts.paid ? { paidAt: now } : {}),
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

/** De eerste maand gratis starten als de vlag aan staat (lib/billing/partnerdeal-vrij.ts); nooit een fout naar boven. */
async function eersteMaandGratisAlsAan(tenantId: string, bedrijf: string, dienst: Date): Promise<void> {
  if (!(await featureEnabled(EERSTE_MAAND_GRATIS_VLAG).catch(() => false))) return;
  await startEersteMaandGratis({ tenantId, bedrijf, eersteDienst: dienst });
}
