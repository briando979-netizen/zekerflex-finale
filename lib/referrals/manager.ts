import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { Referral, ReferralSchema } from "../affiliates/types";

export async function createReferral(referrerId: string, reward: number = 50, rewardType: "CREDIT" | "DISCOUNT" | "CASH" = "CREDIT"): Promise<Referral> {
  const code = `ref_${nanoid(10)}`;
  const link = `https://zekerflex.com/join?ref=${code}`;

  const referral = await prisma.referral.create({
    data: {
      referrerId,
      code,
      link,
      status: "ACTIVE",
      reward,
      rewardType,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });

  return ReferralSchema.parse(referral);
}

export async function claimReferral(code: string, referredUserId: string): Promise<Referral | null> {
  const referral = await prisma.referral.findUnique({
    where: { code },
  });

  if (!referral || referral.status !== "ACTIVE" || (referral.expiresAt && referral.expiresAt < new Date())) {
    return null;
  }

  const updated = await prisma.referral.update({
    where: { code },
    data: {
      status: "CONVERTED",
      referredUserId,
      convertedAt: new Date(),
      claimedAt: new Date(),
    },
  });

  return ReferralSchema.parse(updated);
}

export async function getReferralStats(referrerId: string) {
  const referrals = await prisma.referral.findMany({
    where: { referrerId },
  });

  const converted = referrals.filter((r) => r.status === "CONVERTED");
  const totalRewards = converted.reduce((sum, r) => sum + r.reward, 0);

  return {
    total: referrals.length,
    active: referrals.filter((r) => r.status === "ACTIVE").length,
    converted: converted.length,
    conversionRate: referrals.length > 0 ? (converted.length / referrals.length) * 100 : 0,
    totalRewards,
    pendingRewards: 0, // Would calculate based on pending claims
  };
}

export async function expireOldReferrals(): Promise<number> {
  const result = await prisma.referral.updateMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });

  return result.count;
}
