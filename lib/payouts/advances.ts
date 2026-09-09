import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isValidIban, triggerInstantPayout } from "@/lib/billing/sepa";

// ---------------------------------------------------------------------------
// Voorschot (advance against the next payout). Postgres-backed (AdvanceRecord)
// — no Payment / Invoice rows are touched.
//
// Two kinds:
//   "manual"  — freelancer taps "voorschot", 3% fee, settled against the next
//               reverse-billing payout (see /api/me/payout).
//   "payroll" — uitzendkracht: on timesheet approval the platform pays out an
//               "instant advance" (~50% of expected gross) within ~1 min, then
//               the weekly payroll run reconciles it against the net wage. This
//               is legal because it's an advance ON wages, not wage payment —
//               loonheffing/premies/pensioen are still processed by payroll.
//
// Previously this lived on local disk (storage/payouts/advances/*.jsonl) —
// unreliable on Vercel's serverless functions, whose filesystem is read-only
// outside /tmp.
// ---------------------------------------------------------------------------

export type AdvanceStatus = "requested" | "approved" | "settled" | "rejected";

export interface Advance {
  id: string;
  userId: string;
  amountCents: number; // gross advance
  feeCents: number; // platform fee on the advance
  netCents: number; // amount - fee, paid out now
  requestedAt: string;
  status: AdvanceStatus;
  settledAt?: string;
  note?: string;

  // --- payroll instant-advance context ---
  kind?: "manual" | "payroll";
  isoWeek?: string;
  timesheetId?: string;
  expectedGrossCents?: number;
  /** SEPA result of the instant disbursement */
  payoutStatus?: string;
  providerRef?: string | null;
  paidAt?: string;
  /** set when the weekly payroll run has offset this advance against the net wage */
  reconciledAt?: string;
  reconciledNetCents?: number;
}

type AdvanceRow = {
  id: string;
  userId: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  status: string;
  kind: string | null;
  isoWeek: string | null;
  timesheetId: string | null;
  expectedGrossCents: number | null;
  payoutStatus: string | null;
  providerRef: string | null;
  note: string | null;
  requestedAt: Date;
  settledAt: Date | null;
  paidAt: Date | null;
  reconciledAt: Date | null;
  reconciledNetCents: number | null;
};

function toAdvance(row: AdvanceRow): Advance {
  const kind: Advance["kind"] = row.kind === "manual" || row.kind === "payroll" ? row.kind : undefined;
  return {
    id: row.id,
    userId: row.userId,
    amountCents: row.amountCents,
    feeCents: row.feeCents,
    netCents: row.netCents,
    requestedAt: row.requestedAt.toISOString(),
    status: row.status as AdvanceStatus,
    ...(row.settledAt ? { settledAt: row.settledAt.toISOString() } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(kind ? { kind } : {}),
    ...(row.isoWeek ? { isoWeek: row.isoWeek } : {}),
    ...(row.timesheetId ? { timesheetId: row.timesheetId } : {}),
    ...(row.expectedGrossCents !== null ? { expectedGrossCents: row.expectedGrossCents } : {}),
    ...(row.payoutStatus ? { payoutStatus: row.payoutStatus } : {}),
    ...(row.providerRef !== undefined ? { providerRef: row.providerRef } : {}),
    ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}),
    ...(row.reconciledAt ? { reconciledAt: row.reconciledAt.toISOString() } : {}),
    ...(row.reconciledNetCents !== null ? { reconciledNetCents: row.reconciledNetCents } : {}),
  };
}

export async function listAdvances(userId: string): Promise<Advance[]> {
  const rows = await prisma.advanceRecord.findMany({ where: { userId }, orderBy: { requestedAt: "desc" } });
  return rows.map(toAdvance);
}

/** Total advanced amount not yet settled (deducted from the next payout). */
export async function outstandingAdvanceCents(userId: string): Promise<number> {
  const rows = await prisma.advanceRecord.findMany({
    where: { userId, status: { in: ["requested", "approved"] } },
    select: { amountCents: true },
  });
  return rows.reduce((s, a) => s + a.amountCents, 0);
}

export function advanceFee(amountCents: number): number {
  return Math.round(amountCents * env.ADVANCE_FEE_RATE);
}

export function maxAdvanceCents(pendingPayoutCents: number, alreadyOutstandingCents: number): number {
  return Math.max(0, Math.round(pendingPayoutCents * env.ADVANCE_MAX_RATE_OF_PENDING) - alreadyOutstandingCents);
}

export async function requestAdvance(
  userId: string,
  amountCents: number,
  pendingPayoutCents: number,
): Promise<Advance> {
  const amount = Math.round(amountCents);
  if (amount < 500) throw new Error("Minimaal € 5,00");
  const outstanding = await outstandingAdvanceCents(userId);
  const cap = maxAdvanceCents(pendingPayoutCents, outstanding);
  if (amount > cap) {
    throw new Error(
      `Maximaal € ${(cap / 100).toFixed(2).replace(".", ",")} beschikbaar als voorschot (${Math.round(
        env.ADVANCE_MAX_RATE_OF_PENDING * 100,
      )}% van je openstaande bedrag, minus lopende voorschotten).`,
    );
  }
  const fee = advanceFee(amount);
  const row = await prisma.advanceRecord.create({
    data: {
      id: randomUUID().slice(0, 12),
      userId,
      amountCents: amount,
      feeCents: fee,
      netCents: amount - fee,
      status: "requested",
    },
  });
  return toAdvance(row);
}

/** Mark advances settled once the next payout has cleared (admin / cron use). */
export async function settleAdvances(userId: string): Promise<void> {
  await prisma.advanceRecord.updateMany({
    where: { userId, status: { in: ["requested", "approved"] } },
    data: { status: "settled", settledAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Payroll instant-advance
// ---------------------------------------------------------------------------

/**
 * Pay an instant advance on the expected wage of a just-approved uitzend
 * timesheet. Records the advance and fires a best-effort instant SEPA payout;
 * a payout failure leaves the record for retry rather than throwing.
 */
export async function createPayrollAdvance(input: {
  userId: string;
  workerName: string;
  timesheetId: string;
  isoWeek: string;
  expectedGrossCents: number;
  creditorIban: string | null | undefined;
  stripeConnectedAccountId?: string | null;
}): Promise<Advance | null> {
  const amountCents = Math.round(input.expectedGrossCents * env.PAYROLL_ADVANCE_RATE_OF_GROSS);
  if (amountCents < 500) return null; // not worth an instant transfer

  // one advance per timesheet
  const existing = await prisma.advanceRecord.findFirst({
    where: { kind: "payroll", timesheetId: input.timesheetId },
  });
  if (existing) return toAdvance(existing);

  const feeCents = advanceFee(amountCents);
  const netCents = amountCents - feeCents;
  const id = randomUUID().slice(0, 12);

  let payoutStatus = "PENDING";
  let providerRef: string | null = null;
  let paidAt: Date | null = null;
  let note: string | null = null;

  const iban = input.creditorIban ?? undefined;
  const canPayout = input.stripeConnectedAccountId || (iban && isValidIban(iban));
  if (canPayout) {
    try {
      const res = await triggerInstantPayout({
        endToEndId: `ADV-${id}`,
        amountCents: netCents,
        currency: "EUR",
        creditorIban: iban ?? "",
        creditorName: input.workerName,
        remittanceInfo: `ZekerFlex voorschot ${input.isoWeek}`,
        stripeConnectedAccountId: input.stripeConnectedAccountId ?? null,
      });
      payoutStatus = res.status;
      providerRef = res.providerRef;
      if (res.status === "SETTLED" || res.status === "SUBMITTED") paidAt = new Date();
    } catch (err) {
      payoutStatus = "FAILED";
      logger.warn("payroll instant advance payout failed; queued for retry", {
        advanceId: id,
        error: (err as Error).message,
      });
    }
  } else {
    payoutStatus = "FAILED";
    note = "Geen geldig IBAN of gekoppelde Stripe-rekening — voorschot in wachtrij.";
  }

  const row = await prisma.advanceRecord.create({
    data: {
      id,
      userId: input.userId,
      amountCents,
      feeCents,
      netCents,
      status: "approved",
      kind: "payroll",
      isoWeek: input.isoWeek,
      timesheetId: input.timesheetId,
      expectedGrossCents: Math.round(input.expectedGrossCents),
      payoutStatus,
      providerRef,
      paidAt,
      note,
    },
  });
  return toAdvance(row);
}

/** All payroll advances (any status) tied to a given week. */
export async function payrollAdvancesForWeek(userId: string, isoWeek: string): Promise<Advance[]> {
  const rows = await prisma.advanceRecord.findMany({ where: { userId, kind: "payroll", isoWeek } });
  return rows.map(toAdvance);
}

/**
 * The weekly payroll run offsets the disbursed advances against the net wage.
 * Returns the totals for the payslip; flips still-open advances to "settled".
 */
export async function reconcilePayrollAdvances(
  userId: string,
  isoWeek: string,
  netWageCents: number,
): Promise<{ grossCents: number; netPaidCents: number; feeCents: number; count: number }> {
  const rows = await prisma.advanceRecord.findMany({ where: { userId, kind: "payroll", isoWeek } });
  const grossCents = rows.reduce((s, a) => s + a.amountCents, 0);
  const netPaidCents = rows.reduce((s, a) => s + a.netCents, 0);
  const feeCents = rows.reduce((s, a) => s + a.feeCents, 0);
  const toSettle = rows.filter((a) => a.status === "approved").map((a) => a.id);
  if (toSettle.length > 0) {
    await prisma.advanceRecord.updateMany({
      where: { id: { in: toSettle } },
      data: {
        status: "settled",
        settledAt: new Date(),
        reconciledAt: new Date(),
        reconciledNetCents: netWageCents,
      },
    });
  }
  return { grossCents, netPaidCents, feeCents, count: rows.length };
}
