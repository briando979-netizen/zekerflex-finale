import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { Affiliate, AffiliateSchema } from "./types";

export async function registerAffiliate(userId: string, email: string, name: string): Promise<Affiliate> {
  const code = `aff_${nanoid(12)}`;
  const affiliate = await prisma.affiliate.create({
    data: {
      userId,
      code,
      email,
      name,
      status: "PENDING",
      commissionRate: 10,
      tier: "BRONZE",
    },
  });
  return AffiliateSchema.parse(affiliate);
}

export async function approveAffiliate(affiliateId: string): Promise<Affiliate> {
  const affiliate = await prisma.affiliate.update({
    where: { id: affiliateId },
    data: { status: "APPROVED" },
  });
  return AffiliateSchema.parse(affiliate);
}

export async function updateCommissionTier(affiliateId: string, totalConversions: number): Promise<string> {
  let tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" = "BRONZE";
  let rate = 10;

  if (totalConversions >= 1000) {
    tier = "PLATINUM";
    rate = 30;
  } else if (totalConversions >= 500) {
    tier = "GOLD";
    rate = 25;
  } else if (totalConversions >= 100) {
    tier = "SILVER";
    rate = 15;
  }

  await prisma.affiliate.update({
    where: { id: affiliateId },
    data: { tier, commissionRate: rate },
  });

  return tier;
}

export async function suspendAffiliate(affiliateId: string, reason: string): Promise<void> {
  await prisma.affiliate.update({
    where: { id: affiliateId },
    data: { status: "SUSPENDED" },
  });
}

export async function getAffiliateByCode(code: string): Promise<Affiliate | null> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { code },
  });
  return affiliate ? AffiliateSchema.parse(affiliate) : null;
}

export async function getAffiliateStats(affiliateId: string) {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  const commissions = await prisma.commission.findMany({
    where: { affiliateId },
  });

  const totalCommissions = commissions.reduce((sum, c) => sum + (c.status === "PAID" ? c.amount : 0), 0);
  const pendingCommissions = commissions.reduce((sum, c) => sum + (c.status === "PENDING" ? c.amount : 0), 0);

  return {
    affiliate: affiliate ? AffiliateSchema.parse(affiliate) : null,
    totalEarnings: affiliate?.totalEarnings || 0,
    pendingEarnings: pendingCommissions,
    totalConversions: affiliate?.totalConversions || 0,
    commissionRate: affiliate?.commissionRate || 0,
    tier: affiliate?.tier || "BRONZE",
  };
}
