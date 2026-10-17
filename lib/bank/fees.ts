import type { BankAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { platformAccount } from "@/lib/bank/accounts";
import { transfer } from "@/lib/bank/ledger";

// ---------------------------------------------------------------------------
// What ZekerFlex Bank costs. The admin sets the amounts (/admin/bank). Fees
// are a transfer to the platform account, so they show up on both sides.
// The monthly fee is charged by the daily cron once nextFeeAt has passed;
// the first month is free. Without enough balance it's retried the next day
// — an account is never pushed below zero by a fee.
// ---------------------------------------------------------------------------

export interface BankFees {
  monthlyPersonalCents: number;
  monthlyOrganisationCents: number;
  cardVirtualCents: number;
  cardPhysicalCents: number;
}

export const DEFAULT_FEES: BankFees = {
  monthlyPersonalCents: 199,
  monthlyOrganisationCents: 995,
  cardVirtualCents: 250,
  cardPhysicalCents: 750,
};

const KEY = "bank-fees";

export async function getFees(): Promise<BankFees> {
  return { ...DEFAULT_FEES, ...((await kvGet<Partial<BankFees>>(KEY)) ?? {}) };
}

export async function setFees(fees: BankFees): Promise<BankFees> {
  await kvSet(KEY, fees);
  return fees;
}

export function monthlyFeeFor(account: Pick<BankAccount, "ownerType">, fees: BankFees): number {
  if (account.ownerType === "PLATFORM") return 0;
  return account.ownerType === "TENANT" ? fees.monthlyOrganisationCents : fees.monthlyPersonalCents;
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Daily: charge every account whose monthly fee is due. */
export async function chargeMonthlyFees(now = new Date()): Promise<{ charged: number; skipped: number }> {
  const fees = await getFees();
  const platform = await platformAccount();
  const due = await prisma.bankAccount.findMany({
    where: { ownerType: { not: "PLATFORM" }, nextFeeAt: { lte: now } },
    take: 1000,
  });
  let charged = 0;
  let skipped = 0;
  for (const account of due) {
    const amount = monthlyFeeFor(account, fees);
    const period = monthKey(account.nextFeeAt ?? now);
    try {
      if (amount > 0) {
        await transfer({
          fromAccountId: account.id,
          toAccountId: platform.id,
          amountCents: amount,
          kind: "FEE_MONTHLY",
          description: `Maandkosten ZekerFlex Bank ${period}`,
          toDescription: `Maandkosten ${account.holderName} ${period}`,
          fromCounterparty: "ZekerFlex B.V.",
          toCounterparty: account.holderName,
          idempotencyKey: `fee-monthly:${account.id}:${period}`,
          allowFrozen: true,
        });
      }
      const next = new Date(account.nextFeeAt ?? now);
      next.setUTCMonth(next.getUTCMonth() + 1);
      await prisma.bankAccount.update({ where: { id: account.id }, data: { nextFeeAt: next } });
      charged++;
    } catch (err) {
      skipped++;
      logger.info("bank monthly fee not charged yet", { accountId: account.id, reason: (err as Error).message });
    }
  }
  return { charged, skipped };
}
