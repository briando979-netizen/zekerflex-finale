import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { movePot } from "@/lib/bank/pots";

// ---------------------------------------------------------------------------
// Automatic saving rules per account:
//   - earningPct: put X% of every earnings credit into a pot (e.g. Belasting)
//   - roundUp: round every card payment up to the next euro, the difference
//     goes into a pot
// Best effort: a rule that can't run (pot gone, too little balance) is
// skipped and never blocks the payment or payout that triggered it.
//   key "bank-autosave:<accountId>"
// ---------------------------------------------------------------------------

export interface AutoSaveRules {
  earningPct: number;
  earningPotId: string | null;
  roundUp: boolean;
  roundUpPotId: string | null;
}

export const NO_RULES: AutoSaveRules = { earningPct: 0, earningPotId: null, roundUp: false, roundUpPotId: null };
const key = (accountId: string) => `bank-autosave:${accountId}`;

export async function getRules(accountId: string): Promise<AutoSaveRules> {
  return { ...NO_RULES, ...((await kvGet<Partial<AutoSaveRules>>(key(accountId))) ?? {}) };
}

export async function setRules(accountId: string, rules: AutoSaveRules): Promise<AutoSaveRules> {
  for (const potId of [rules.earningPotId, rules.roundUpPotId]) {
    if (potId && !(await prisma.bankPot.findFirst({ where: { id: potId, accountId, kind: "POT", closedAt: null } }))) {
      throw new Error("Kies een eigen potje (geen deposito)");
    }
  }
  await kvSet(key(accountId), rules);
  return rules;
}

/** After an earnings credit: save the configured share. */
export async function applyEarningRule(accountId: string, amountCents: number, entryId: string): Promise<number> {
  const rules = await getRules(accountId);
  if (!rules.earningPotId || rules.earningPct <= 0) return 0;
  const save = Math.floor((amountCents * Math.min(rules.earningPct, 100)) / 100);
  if (save <= 0) return 0;
  try {
    await movePot({ potId: rules.earningPotId, accountId, direction: "in", amountCents: save, requestKey: `autosave-${entryId}` });
    return save;
  } catch (err) {
    logger.info("autosave on earnings skipped", { accountId, reason: (err as Error).message });
    return 0;
  }
}

/** After a card capture: round up to the next euro into the pot. */
export async function applyRoundUp(accountId: string, spentCents: number, ref: string): Promise<number> {
  const rules = await getRules(accountId);
  const rest = spentCents % 100;
  if (!rules.roundUp || !rules.roundUpPotId || rest === 0) return 0;
  try {
    await movePot({ potId: rules.roundUpPotId, accountId, direction: "in", amountCents: 100 - rest, requestKey: `roundup-${ref}` });
    return 100 - rest;
  } catch (err) {
    logger.info("round-up skipped", { accountId, reason: (err as Error).message });
    return 0;
  }
}
