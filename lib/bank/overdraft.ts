import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isoWeekId, isoWeekOf } from "@/lib/payroll/week";
import { platformAccount } from "@/lib/bank/accounts";
import { getFees } from "@/lib/bank/fees";
import { transfer } from "@/lib/bank/ledger";
import { movePot } from "@/lib/bank/pots";

// ---------------------------------------------------------------------------
// Keeping accounts positive. Normal debits can never pass zero; only a card
// capture larger than its hold (tip, fuel) can. Daily:
//   1. cover the gap from the holder's own pots (not deposits) first;
//   2. still negative → the "rood staan" fee, once per ISO week, until the
//      account is back at zero or above. Card payments are declined while
//      negative anyway (the balance check fails).
// ---------------------------------------------------------------------------

export async function settleNegativeBalances(now = new Date()): Promise<{ covered: number; charged: number }> {
  const negative = await prisma.bankAccount.findMany({ where: { ownerType: { not: "PLATFORM" }, balanceCents: { lt: 0 } }, take: 1000 });
  if (negative.length === 0) return { covered: 0, charged: 0 };
  const fee = (await getFees()).negativeBalanceFeeCents;
  const platform = await platformAccount();
  const week = isoWeekId(isoWeekOf(now));
  let covered = 0;
  let charged = 0;
  for (const account of negative) {
    try {
      let deficit = -account.balanceCents;
      const pots = await prisma.bankPot.findMany({ where: { accountId: account.id, kind: "POT", closedAt: null, balanceCents: { gt: 0 } }, orderBy: { balanceCents: "desc" } });
      for (const pot of pots) {
        if (deficit <= 0) break;
        const take = Math.min(pot.balanceCents, deficit);
        await movePot({ potId: pot.id, accountId: account.id, direction: "out", amountCents: take, requestKey: `overdraft-${week}-${now.toISOString().slice(0, 10)}` });
        deficit -= take;
      }
      if (deficit <= 0) {
        covered++;
        continue;
      }
      if (fee > 0) {
        await transfer({
          fromAccountId: account.id,
          toAccountId: platform.id,
          amountCents: fee,
          kind: "FEE_MONTHLY",
          description: `Kosten rood staan (week ${week.slice(-2)})`,
          toDescription: `Rood staan ${account.holderName} ${week}`,
          fromCounterparty: "ZekerFlex B.V.",
          toCounterparty: account.holderName,
          idempotencyKey: `overdraft-fee:${account.id}:${week}`,
          allowNegative: true,
          allowFrozen: true,
        });
        charged++;
      }
    } catch (err) {
      logger.error("negative balance handling failed", { accountId: account.id, error: (err as Error).message });
    }
  }
  return { covered, charged };
}
