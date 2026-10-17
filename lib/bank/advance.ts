import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { platformAccount, personalAccount } from "@/lib/bank/accounts";
import { creditEarning, getPayoutDestination } from "@/lib/bank/earnings";
import { book, transfer } from "@/lib/bank/ledger";
import type { Advance } from "@/lib/payouts/advances";

// ---------------------------------------------------------------------------
// Voorschot (advance) through ZekerFlex Bank. When a freelancer receives
// earnings on the bank, a requested advance is credited at once (net of the
// fee). The next earnings credit settles it: the net amount is booked back
// and the fee goes to the platform account. Only for invoice-track workers
// with earnings on the bank — otherwise there's nothing to settle against.
//   AdvanceRecord.providerRef = "zfbank:<entryId>" marks a bank advance.
// ---------------------------------------------------------------------------

export async function canAdvanceToBank(userId: string): Promise<boolean> {
  if ((await getPayoutDestination(userId)) !== "bank") return false;
  return invoiceModeFor(await getFiscal(userId)) !== "payroll";
}

export async function payAdvanceToBank(advance: Advance, holderName: string): Promise<void> {
  if (!(await canAdvanceToBank(advance.userId))) throw AppError.precondition("Zet eerst 'Verdiensten op ZekerFlex Bank' aan");
  const { entry } = await creditEarning({
    userId: advance.userId,
    holderName,
    amountCents: advance.netCents,
    description: `Voorschot op je verdiensten (na ${(advance.feeCents / 100).toFixed(2).replace(".", ",")} vergoeding)`,
    counterparty: "ZekerFlex B.V.",
    reference: advance.id,
    idempotencyKey: `advance:${advance.id}`,
  });
  await prisma.advanceRecord.update({
    where: { id: advance.id },
    data: { status: "approved", payoutStatus: "SETTLED", providerRef: `zfbank:${entry.id}`, paidAt: new Date() },
  });
}

/** Settles open bank advances against earnings that just arrived. */
export async function settleBankAdvances(userId: string, holderName: string): Promise<number> {
  const open = await prisma.advanceRecord.findMany({ where: { userId, status: "approved", providerRef: { startsWith: "zfbank:" } } });
  if (open.length === 0) return 0;
  const account = await personalAccount(userId, holderName);
  const platform = await platformAccount();
  let settled = 0;
  for (const a of open) {
    try {
      await book(
        account.id,
        { amountCents: -a.netCents, kind: "ADJUSTMENT", description: "Voorschot verrekend met je verdiensten", reference: a.id, idempotencyKey: `advance-settle:${a.id}` },
        { allowNegative: true, allowFrozen: true },
      );
      if (a.feeCents > 0) {
        await transfer({
          fromAccountId: account.id,
          toAccountId: platform.id,
          amountCents: a.feeCents,
          kind: "FEE_MONTHLY",
          description: "Vergoeding voorschot",
          toDescription: `Voorschotvergoeding ${holderName}`,
          fromCounterparty: "ZekerFlex B.V.",
          toCounterparty: holderName,
          idempotencyKey: `advance-fee:${a.id}`,
          allowNegative: true,
          allowFrozen: true,
        });
      }
      await prisma.advanceRecord.update({ where: { id: a.id }, data: { status: "settled", settledAt: new Date() } });
      settled++;
    } catch (err) {
      logger.error("bank advance settlement failed", { advanceId: a.id, error: (err as Error).message });
    }
  }
  return settled;
}
