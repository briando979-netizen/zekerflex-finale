import { prisma } from "@/lib/prisma";

export async function approveCommission(commissionId: string): Promise<void> {
  await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "APPROVED" },
  });
}

export async function disputeCommission(commissionId: string, notes: string): Promise<void> {
  await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "DISPUTED", notes },
  });
}

export async function processPayouts(affiliateIds: string[] = []) {
  const commissions = await prisma.commission.findMany({
    where: {
      status: "APPROVED",
      payoutId: null,
      ...(affiliateIds.length > 0 && { affiliateId: { in: affiliateIds } }),
    },
    include: { affiliate: true },
  });

  const payouts: { [key: string]: number } = {};

  for (const commission of commissions) {
    if (!payouts[commission.affiliateId]) payouts[commission.affiliateId] = 0;
    payouts[commission.affiliateId] += commission.amount;
  }

  const results = [];
  for (const [affiliateId, total] of Object.entries(payouts)) {
    if (total < 50) continue; // Minimum payout $50

    // Create payout record
    const payout = await prisma.payout.create({
      data: {
        affiliateId,
        amount: total,
        status: "PENDING",
      },
    });

    // Mark commissions as paid
    await prisma.commission.updateMany({
      where: {
        affiliateId,
        status: "APPROVED",
        payoutId: null,
      },
      data: {
        status: "PAID",
        payoutId: payout.id,
        payoutDate: new Date(),
      },
    });

    // Update affiliate payout date
    await prisma.affiliate.update({
      where: { id: affiliateId },
      data: { lastPayoutAt: new Date() },
    });

    results.push({ affiliateId, payoutId: payout.id, amount: total });
  }

  return results;
}

export async function getCommissionsByAffiliate(affiliateId: string, status?: string) {
  const commissions = await prisma.commission.findMany({
    where: {
      affiliateId,
      ...(status && { status }),
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    total: commissions.length,
    byStatus: commissions.reduce(
      (acc, c) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
    totalAmount: commissions.reduce((sum, c) => sum + c.amount, 0),
    commissions,
  };
}

export async function detectFraudulentActivity(affiliateId: string) {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  if (!affiliate) return { risky: false, flags: [] };

  const trackings = await prisma.tracking.findMany({
    where: { affiliateId },
  });

  const flags = [];

  // Check for suspiciously high conversion rate
  const converted = trackings.filter((t) => t.converted).length;
  if (trackings.length > 0 && converted / trackings.length > 0.5) {
    flags.push("HIGH_CONVERSION_RATE");
  }

  // Check for unusual device patterns
  const deviceIds = trackings.map((t) => t.deviceId);
  if (new Set(deviceIds).size === 1 && deviceIds.length > 10) {
    flags.push("SAME_DEVICE_PATTERN");
  }

  // Check for rapid conversions
  const rapidConversions = trackings.filter((t) => {
    const timeDiff = t.lastClick.getTime() - t.firstClick.getTime();
    return timeDiff < 60000; // Less than 1 minute
  });
  if (rapidConversions.length / trackings.length > 0.3) {
    flags.push("RAPID_CONVERSIONS");
  }

  return {
    risky: flags.length > 0,
    flags,
    suspiciousScore: flags.length / 3, // Normalize to 0-1
  };
}
