import { randomBytes } from "node:crypto";
import type { BankAccount } from "@prisma/client";
import { logger } from "@/lib/logger";
import { kvFindByField, kvGet, kvSet } from "@/lib/storage/kv";
import { platformAccount, personalAccount } from "@/lib/bank/accounts";
import { transfer } from "@/lib/bank/ledger";
import { prisma } from "@/lib/prisma";
import { notifyBank } from "@/lib/bank/notify";

// ---------------------------------------------------------------------------
// Doorverwijzen met bonus. Everyone gets a personal code (/r/<code> sets a
// cookie, registration records who referred whom). The bonus is paid only
// once the new user actually completes something — their first approved
// klus (freelancer) or the first klus they approve (employer) — so fake
// sign-ups earn nothing. Paid from the platform account into ZekerFlex Bank.
//   key "ref-code:<code>"       → userId
//   key "ref-code-of:<userId>"  → code
//   key "ref-by:<newUserId>"    → Referral
//   key "ref-rewards"           → { referrerCents, newUserCents }
// ---------------------------------------------------------------------------

export interface Referral {
  referrerId: string;
  newUserId: string;
  at: string;
  rewardedAt?: string;
}
export interface ReferralRewards {
  referrerCents: number;
  newUserCents: number;
}

export const DEFAULT_REWARDS: ReferralRewards = { referrerCents: 2500, newUserCents: 1000 };
export const REF_COOKIE = "zf_ref";

export async function getRewards(): Promise<ReferralRewards> {
  return { ...DEFAULT_REWARDS, ...((await kvGet<Partial<ReferralRewards>>("ref-rewards")) ?? {}) };
}

export async function setRewards(r: ReferralRewards): Promise<ReferralRewards> {
  await kvSet("ref-rewards", r);
  return r;
}

export async function codeFor(userId: string): Promise<string> {
  const existing = await kvGet<string>(`ref-code-of:${userId}`);
  if (existing) return existing;
  const code = randomBytes(4).toString("base64url").replace(/[-_]/g, "x").slice(0, 6).toUpperCase();
  await kvSet(`ref-code:${code}`, userId);
  await kvSet(`ref-code-of:${userId}`, code);
  return code;
}

export async function userForCode(code: string): Promise<string | null> {
  if (!/^[A-Z0-9x]{4,10}$/i.test(code)) return null;
  return kvGet<string>(`ref-code:${code.toUpperCase()}`);
}

/** At registration: remember who referred this new user (never self, never twice). */
export async function recordReferral(newUserId: string, code: string | null | undefined): Promise<void> {
  if (!code) return;
  const referrerId = await userForCode(code);
  if (!referrerId || referrerId === newUserId) return;
  if (await kvGet(`ref-by:${newUserId}`)) return;
  await kvSet(`ref-by:${newUserId}`, { referrerId, newUserId, at: new Date().toISOString() } satisfies Referral);
}

/**
 * The new user completed their first real activity: pay both bonuses once.
 * `newUserAccount` is where the newcomer's bonus lands (their personal or
 * company account). Never throws — a reward must not break an approval.
 */
export async function rewardReferral(newUserId: string, newUserAccount: BankAccount | null): Promise<boolean> {
  try {
    const ref = await kvGet<Referral>(`ref-by:${newUserId}`);
    if (!ref || ref.rewardedAt) return false;
    const rewards = await getRewards();
    const platform = await platformAccount();
    const [referrer, newcomer] = await Promise.all([
      prisma.user.findUnique({ where: { id: ref.referrerId }, select: { fullName: true } }),
      prisma.user.findUnique({ where: { id: newUserId }, select: { fullName: true } }),
    ]);
    if (rewards.referrerCents > 0 && referrer) {
      const to = await personalAccount(ref.referrerId, referrer.fullName);
      await transfer({
        fromAccountId: platform.id,
        toAccountId: to.id,
        amountCents: rewards.referrerCents,
        kind: "BONUS",
        description: `Verwijsbonus voor ${newcomer?.fullName ?? "een nieuwe gebruiker"}`,
        toDescription: `Verwijsbonus: ${newcomer?.fullName ?? "je uitnodiging"} is gestart 🎉`,
        fromCounterparty: referrer.fullName,
        toCounterparty: "ZekerFlex B.V.",
        idempotencyKey: `ref-reward:${newUserId}:referrer`,
        allowNegative: true,
      });
      await notifyBank(to.id, "incoming", "🎁 Verwijsbonus ontvangen", `${newcomer?.fullName ?? "Je uitnodiging"} heeft de eerste klus afgerond — de bonus staat op je ZekerFlex Bank.`);
    }
    if (rewards.newUserCents > 0 && newUserAccount) {
      await transfer({
        fromAccountId: platform.id,
        toAccountId: newUserAccount.id,
        amountCents: rewards.newUserCents,
        kind: "BONUS",
        description: `Welkomstbonus ${newcomer?.fullName ?? ""}`.trim(),
        toDescription: `Welkomstbonus — uitgenodigd door ${referrer?.fullName ?? "een vriend"} 🎁`,
        fromCounterparty: newUserAccount.holderName,
        toCounterparty: "ZekerFlex B.V.",
        idempotencyKey: `ref-reward:${newUserId}:newcomer`,
        allowNegative: true,
      });
      await notifyBank(newUserAccount.id, "incoming", "🎁 Welkomstbonus ontvangen", "Bedankt voor je eerste klus — je welkomstbonus staat op je ZekerFlex Bank.");
    }
    await kvSet(`ref-by:${newUserId}`, { ...ref, rewardedAt: new Date().toISOString() } satisfies Referral);
    return true;
  } catch (err) {
    logger.error("referral reward failed", { newUserId, error: (err as Error).message });
    return false;
  }
}

export async function referralStats(userId: string): Promise<{ invited: number; rewarded: number; earnedCents: number }> {
  const all = await kvFindByField<Referral>("ref-by:", "referrerId", userId, 10_000);
  const rewarded = all.filter((r) => r.rewardedAt).length;
  return { invited: all.length, rewarded, earnedCents: rewarded * (await getRewards()).referrerCents };
}
