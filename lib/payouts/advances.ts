import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isValidIban, triggerInstantPayout } from "@/lib/billing/sepa";

// ---------------------------------------------------------------------------
// Voorschot (advance against the next payout). Filesystem, advisory —
// no Payment / Invoice rows are touched.
//   storage/payouts/advances/<userId>.jsonl
//
// Two kinds:
//   "manual"  — freelancer taps "voorschot", 3% fee, settled against the next
//               reverse-billing payout (see /api/me/payout).
//   "payroll" — uitzendkracht: on timesheet approval the platform pays out an
//               "instant advance" (~50% of expected gross) within ~1 min, then
//               the weekly payroll run reconciles it against the net wage. This
//               is legal because it's an advance ON wages, not wage payment —
//               loonheffing/premies/pensioen are still processed by payroll.
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

const dir = () => join(process.cwd(), "storage", "payouts", "advances");
const file = (userId: string) => join(dir(), `${userId.replace(/[^a-z0-9-]/gi, "")}.jsonl`);

export async function listAdvances(userId: string): Promise<Advance[]> {
  const p = file(userId);
  if (!existsSync(p)) return [];
  const lines = (await readFile(p, "utf8")).split("\n").filter(Boolean);
  const out: Advance[] = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l) as Advance);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
}

/** Total advanced amount not yet settled (deducted from the next payout). */
export async function outstandingAdvanceCents(userId: string): Promise<number> {
  const all = await listAdvances(userId);
  return all
    .filter((a) => a.status === "requested" || a.status === "approved")
    .reduce((s, a) => s + a.amountCents, 0);
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
  const advance: Advance = {
    id: randomUUID().slice(0, 12),
    userId,
    amountCents: amount,
    feeCents: fee,
    netCents: amount - fee,
    requestedAt: new Date().toISOString(),
    status: "requested",
  };
  await mkdir(dir(), { recursive: true });
  await appendFile(file(userId), JSON.stringify(advance) + "\n", "utf8");
  return advance;
}

/** Mark advances settled once the next payout has cleared (admin / cron use). */
export async function settleAdvances(userId: string): Promise<void> {
  const all = await listAdvances(userId);
  const now = new Date().toISOString();
  const next = all.map((a) =>
    a.status === "requested" || a.status === "approved" ? { ...a, status: "settled" as const, settledAt: now } : a,
  );
  await mkdir(dir(), { recursive: true });
  await writeFile(file(userId), next.map((a) => JSON.stringify(a)).join("\n") + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Payroll instant-advance
// ---------------------------------------------------------------------------

async function rewriteAll(userId: string, rows: Advance[]): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await writeFile(file(userId), rows.map((a) => JSON.stringify(a)).join("\n") + "\n", "utf8");
}

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
  const existing = (await listAdvances(input.userId)).find(
    (a) => a.kind === "payroll" && a.timesheetId === input.timesheetId,
  );
  if (existing) return existing;

  const feeCents = advanceFee(amountCents);
  const netCents = amountCents - feeCents;
  const now = new Date().toISOString();
  const advance: Advance = {
    id: randomUUID().slice(0, 12),
    userId: input.userId,
    amountCents,
    feeCents,
    netCents,
    requestedAt: now,
    status: "approved",
    kind: "payroll",
    isoWeek: input.isoWeek,
    timesheetId: input.timesheetId,
    expectedGrossCents: Math.round(input.expectedGrossCents),
    payoutStatus: "PENDING",
    providerRef: null,
  };

  const iban = input.creditorIban ?? undefined;
  const canPayout = input.stripeConnectedAccountId || (iban && isValidIban(iban));
  if (canPayout) {
    try {
      const res = await triggerInstantPayout({
        endToEndId: `ADV-${advance.id}`,
        amountCents: netCents,
        currency: "EUR",
        creditorIban: iban ?? "UNKNOWN",
        creditorName: input.workerName,
        remittanceInfo: `ZekerFlex voorschot ${input.isoWeek}`,
        stripeConnectedAccountId: input.stripeConnectedAccountId ?? null,
      });
      advance.payoutStatus = res.status;
      advance.providerRef = res.providerRef;
      if (res.status === "SETTLED" || res.status === "SUBMITTED") advance.paidAt = new Date().toISOString();
    } catch (err) {
      advance.payoutStatus = "FAILED";
      logger.warn("payroll instant advance payout failed; queued for retry", {
        advanceId: advance.id,
        error: (err as Error).message,
      });
    }
  } else {
    advance.payoutStatus = "FAILED";
    advance.note = "Geen geldig IBAN of gekoppelde Stripe-rekening — voorschot in wachtrij.";
  }

  await mkdir(dir(), { recursive: true });
  await appendFile(file(input.userId), JSON.stringify(advance) + "\n", "utf8");
  return advance;
}

/** All payroll advances (any status) tied to a given week. */
export async function payrollAdvancesForWeek(userId: string, isoWeek: string): Promise<Advance[]> {
  return (await listAdvances(userId)).filter((a) => a.kind === "payroll" && a.isoWeek === isoWeek);
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
  const all = await listAdvances(userId);
  const now = new Date().toISOString();
  let grossCents = 0;
  let netPaidCents = 0;
  let feeCents = 0;
  let count = 0;
  const next = all.map((a) => {
    if (a.kind !== "payroll" || a.isoWeek !== isoWeek) return a;
    grossCents += a.amountCents;
    netPaidCents += a.netCents;
    feeCents += a.feeCents;
    count += 1;
    if (a.status === "approved") {
      return { ...a, status: "settled" as const, settledAt: now, reconciledAt: now, reconciledNetCents: netWageCents };
    }
    return a;
  });
  if (count > 0) await rewriteAll(userId, next);
  return { grossCents, netPaidCents, feeCents, count };
}
