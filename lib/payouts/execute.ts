import { alertOwnerLater } from "@/lib/ops/alert";
import { PaymentStatus, TimesheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { kvFindDue, kvGet, kvSet, kvDelete } from "@/lib/storage/kv";
import { triggerInstantPayout } from "@/lib/billing/sepa";
import { creditEarning, getPayoutDestination } from "@/lib/bank/earnings";
import { settleBankAdvances } from "@/lib/bank/advance";
import { getPayoutPrefs, payoutFee, type PayoutSpeed } from "@/lib/payouts/preferences";
import { fastPayAvailable, getFastPay, hasAcceptedTerms } from "@/lib/payouts/fastpay";

// ---------------------------------------------------------------------------
// When and how a freelancer is paid for an approved klus — the money model:
//   instant  → payout is initiated now, 4% factoring fee withheld
//   threeDay → payout is initiated by the third working day, 2% fee
//   standard → paid in full as soon as the client pays the invoice
// Fast speeds only when the client offers them (credit-checked) AND the
// freelancer accepted the factoring terms; otherwise "standard".
// The client's invoice stays open until the client pays — paying the
// freelancer early never marks the client's invoice as paid.
//   key "payout-scheduled:<paymentId>"   → { dueAt, speed, feeCents }
//   key "payout-on-client:<invoiceId>"   → { paymentId }
//   key "payout-fee:<paymentId>"         → { speed, feeCents, grossCents }
// ---------------------------------------------------------------------------

export async function effectiveSpeed(userId: string, tenantId: string): Promise<PayoutSpeed> {
  const pref = (await getPayoutPrefs(userId)).speed;
  if (pref === "standard") return "standard";
  const [fp, terms] = await Promise.all([getFastPay(tenantId), hasAcceptedTerms(userId)]);
  return fastPayAvailable(fp) && terms ? pref : "standard";
}

/** Working days from `from` (Mon–Fri), for scheduling a payment instruction. */
export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export interface PayoutResult {
  status: PaymentStatus;
  providerRef: string | null;
}

/** Pays one Payment now (bank or SEPA/Connect), minus the fee. Idempotent. */
export async function executePayout(paymentId: string, opts: { speed: PayoutSpeed; feeCents: number }): Promise<PayoutResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: {
        select: {
          id: true,
          number: true,
          timesheet: {
            select: {
              id: true,
              freelancer: { select: { userId: true, stripePayoutsEnabled: true, stripeConnectedAccountId: true, user: { select: { fullName: true } } } },
              branch: { select: { tenant: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!payment) throw AppError.notFound("Uitbetaling niet gevonden");
  if (payment.status === PaymentStatus.SETTLED || payment.status === PaymentStatus.SUBMITTED) return { status: payment.status, providerRef: payment.providerRef };
  const ts = payment.invoice.timesheet;
  if (!ts) throw AppError.precondition("Geen urenbriefje bij deze uitbetaling");
  const fee = Math.max(0, Math.min(opts.feeCents, payment.amountCents));
  const net = payment.amountCents - fee;
  const fl = ts.freelancer;
  const toBank = payment.creditorIban.startsWith("ZF") || (await getPayoutDestination(fl.userId)) === "bank";
  try {
    let result: PayoutResult & { acceptedAt?: string; failureCode?: string | undefined };
    if (toBank) {
      const { entry } = await creditEarning({
        userId: fl.userId,
        holderName: fl.user.fullName,
        amountCents: net,
        description: `Verdiensten ${payment.invoice.number}${fee ? ` (na ${(fee / 100).toFixed(2).replace(".", ",")} snelle-uitbetalingsvergoeding)` : ""}`,
        counterparty: ts.branch.tenant.name,
        reference: payment.invoice.number,
        idempotencyKey: `earning:${payment.invoice.id}`,
      });
      await settleBankAdvances(fl.userId, fl.user.fullName);
      result = { status: PaymentStatus.SETTLED, providerRef: `zfbank:${entry.id}`, acceptedAt: new Date().toISOString() };
    } else {
      const r = await triggerInstantPayout({
        endToEndId: payment.endToEndId,
        amountCents: net,
        currency: "EUR",
        creditorIban: payment.creditorIban,
        creditorName: fl.user.fullName,
        remittanceInfo: `ZekerFlex ${payment.invoice.number}`,
        stripeConnectedAccountId: fl.stripePayoutsEnabled ? fl.stripeConnectedAccountId : null,
      });
      result = { status: r.status, providerRef: r.providerRef, ...(r.acceptedAt ? { acceptedAt: r.acceptedAt } : {}), failureCode: r.failureCode };
    }
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: result.status,
        providerRef: result.providerRef,
        amountCents: net,
        submittedAt: result.acceptedAt ? new Date(result.acceptedAt) : new Date(),
        settledAt: result.status === PaymentStatus.SETTLED ? new Date() : null,
        failureCode: result.failureCode ?? null,
      },
    });
    if (fee) {
      await kvSet(`payout-fee:${payment.id}`, { speed: opts.speed, feeCents: fee, grossCents: payment.amountCents });
      await (await import("@/lib/admin/revenue-events")).recordRevenueEvent("fastpay", fee).catch(() => undefined);
    }
    if (result.status === PaymentStatus.SETTLED) await prisma.timesheet.update({ where: { id: ts.id }, data: { status: TimesheetStatus.PAID } });
    return { status: result.status, providerRef: result.providerRef };
  } catch (err) {
    const message = err instanceof AppError ? err.message : "Payout error";
    await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, failureCode: message.slice(0, 120) } });
    alertOwnerLater({
      key: `payout:${payment.id}`,
      title: "Uitbetaling mislukt",
      detail: `Uitbetaling van ${(payment.amountCents / 100).toFixed(2).replace(".", ",")} euro (betaling ${payment.id}) is mislukt: ${message.slice(0, 160)}. De freelancer wacht op zijn geld.`,
      url: "/admin/facturen",
    });
    logger.error("payout failed; queued for retry", { paymentId, error: message });
    return { status: PaymentStatus.FAILED, providerRef: null };
  }
}

/**
 * After approval: pay now, schedule, or wait for the client — per the
 * freelancer's choice and what this client allows.
 */
export async function dispatchPayout(input: { paymentId: string; invoiceId: string; userId: string; tenantId: string; amountCents: number; now?: Date }): Promise<{ speed: PayoutSpeed; status: PaymentStatus; providerRef: string | null; dueAt?: string }> {
  const speed = await effectiveSpeed(input.userId, input.tenantId);
  if (speed === "instant") {
    const r = await executePayout(input.paymentId, { speed, feeCents: payoutFee(input.amountCents, "instant") });
    return { speed, ...r };
  }
  if (speed === "threeDay") {
    // The daily cron must submit by working day three; running a day early
    // avoids missing the deadline between daily runs. Bank settlement may follow later.
    const dueDate = addWorkingDays(input.now ?? new Date(), 2);
    dueDate.setUTCHours(0, 0, 0, 0);
    const dueAt = dueDate.toISOString();
    await kvSet(`payout-scheduled:${input.paymentId}`, { dueAt, speed, feeCents: payoutFee(input.amountCents, "threeDay") });
    return { speed, status: PaymentStatus.PENDING, providerRef: null, dueAt };
  }
  await kvSet(`payout-on-client:${input.invoiceId}`, { paymentId: input.paymentId });
  return { speed, status: PaymentStatus.PENDING, providerRef: null };
}

/** Daily: submit the 3-working-day payout instructions by their deadline. */
export async function runScheduledPayouts(now = new Date(), deadline = Date.now() + 200_000): Promise<{ paid: number; failed: number }> {
  let paid = 0;
  let failed = 0;
  let after = "";
  for (;;) {
    if (Date.now() > deadline) break;
    const page = await kvFindDue<{ dueAt: string; speed: PayoutSpeed; feeCents: number }>("payout-scheduled:", "dueAt", now.toISOString(), after, 200);
    if (!page.length) break;
    after = page.at(-1)!.key;
    for (const { key, value } of page) {
      const r = await executePayout(key.slice("payout-scheduled:".length), { speed: value.speed, feeCents: value.feeCents }).catch(() => ({ status: PaymentStatus.FAILED, providerRef: null }));
      if (r.status === PaymentStatus.FAILED) failed++;
      else {
        paid++;
        await kvDelete(key);
      }
    }
  }
  return { paid, failed };
}

/** Stripe webhook: the client paid the freelancer's invoice → pay the freelancer in full. */
export async function payOnClientPayment(invoiceId: string): Promise<PayoutResult | null> {
  const waiting = await kvGet<{ paymentId: string }>(`payout-on-client:${invoiceId}`);
  if (!waiting) return null;
  const r = await executePayout(waiting.paymentId, { speed: "standard", feeCents: 0 });
  if (r.status !== PaymentStatus.FAILED) await kvDelete(`payout-on-client:${invoiceId}`);
  return r;
}
