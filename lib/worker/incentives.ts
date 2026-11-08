import { prisma } from "@/lib/prisma";
import { z } from "zod";

const incentiveSchema = z.object({
  type: z.enum(["BONUS", "REFERRAL", "LOYALTY", "MILESTONE"]),
  amount: z.number().positive(),
  requirement: z.string(),
  expiresAt: z.string().datetime(),
});

export type Incentive = z.infer<typeof incentiveSchema>;

export async function createIncentive(
  workerId: string,
  incentive: Incentive
) {
  return prisma.workerIncentive.create({
    data: {
      workerId,
      ...incentive,
      expiresAt: new Date(incentive.expiresAt),
    },
  });
}

export async function claimIncentive(incentiveId: string) {
  const incentive = await prisma.workerIncentive.findUnique({
    where: { id: incentiveId },
  });

  if (!incentive || new Date() > incentive.expiresAt) {
    throw new Error("Incentive expired or invalid");
  }

  const updated = await prisma.workerIncentive.update({
    where: { id: incentiveId },
    data: { claimedAt: new Date() },
  });

  await prisma.workerPayment.create({
    data: {
      workerId: incentive.workerId,
      amount: incentive.amount,
      type: "INCENTIVE",
      description: `${incentive.type} incentive`,
    },
  });

  return updated;
}

export async function getReferralBonusForWorker(workerId: string) {
  const referrals = await prisma.workerReferral.findMany({
    where: { referrerId: workerId, activatedAt: { not: null } },
  });

  const bonusPerReferral = 50;
  const totalBonus = referrals.length * bonusPerReferral;

  return { referralCount: referrals.length, totalBonus };
}

export async function getLoyaltyRewards(workerId: string) {
  const shifts = await prisma.shift.count({
    where: { assignedWorkerId: workerId, completedAt: { not: null } },
  });

  const rewards = [];
  if (shifts >= 10) rewards.push({ tier: "SILVER", bonus: 100 });
  if (shifts >= 50) rewards.push({ tier: "GOLD", bonus: 250 });
  if (shifts >= 100) rewards.push({ tier: "PLATINUM", bonus: 500 });

  return rewards;
}
