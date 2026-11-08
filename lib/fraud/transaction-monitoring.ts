import { prisma } from "@/lib/prisma";

export interface TransactionAnomaly {
  transactionId: string;
  userId: string;
  type: "UNUSUAL_AMOUNT" | "RAPID_PAYOUTS" | "PATTERN_DEVIATION" | "GEOGRAPHIC_MISMATCH";
  riskScore: number;
  details: string;
  flaggedAt: Date;
}

export async function monitorPaymentAnomalies(userId: string): Promise<TransactionAnomaly[]> {
  const anomalies: TransactionAnomaly[] = [];

  const recentPayouts = await prisma.payout.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (recentPayouts.length === 0) return anomalies;

  // Calculate average payout
  const amounts = recentPayouts.map((p) => p.amount);
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const stdDev = Math.sqrt(amounts.reduce((sq, n) => sq + Math.pow(n - avgAmount, 2), 0) / amounts.length);

  // Detect outliers (> 2 std devs)
  for (const payout of recentPayouts.slice(0, 5)) {
    if (Math.abs(payout.amount - avgAmount) > 2 * stdDev) {
      anomalies.push({
        transactionId: payout.id,
        userId,
        type: "UNUSUAL_AMOUNT",
        riskScore: 65,
        details: `Payout of €${(payout.amount / 100).toFixed(2)} deviates ${Math.round((Math.abs(payout.amount - avgAmount) / stdDev) * 10) / 10} std devs from average €${(avgAmount / 100).toFixed(2)}`,
        flaggedAt: new Date(),
      });
    }
  }

  // Detect rapid payouts (within 24 hours)
  for (let i = 0; i < recentPayouts.length - 1; i++) {
    const gap = (recentPayouts[i].createdAt.getTime() - recentPayouts[i + 1].createdAt.getTime()) / (1000 * 60 * 60);
    if (gap < 24) {
      anomalies.push({
        transactionId: recentPayouts[i].id,
        userId,
        type: "RAPID_PAYOUTS",
        riskScore: 50,
        details: `Multiple payouts within ${Math.round(gap)} hours`,
        flaggedAt: new Date(),
      });
      break;
    }
  }

  return anomalies;
}

export async function detectPatternDeviation(userId: string): Promise<TransactionAnomaly[]> {
  const anomalies: TransactionAnomaly[] = [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentEarnings = await prisma.earning.findMany({
    where: { userId, createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "asc" },
  });

  if (recentEarnings.length < 5) return anomalies;

  // Calculate trend
  const dailyTotals: Record<string, number> = {};
  for (const earning of recentEarnings) {
    const day = earning.createdAt.toDateString();
    dailyTotals[day] = (dailyTotals[day] ?? 0) + earning.amount;
  }

  const values = Object.values(dailyTotals);
  const avgDaily = values.reduce((a, b) => a + b, 0) / values.length;

  // Detect sudden spike
  const latestDaily = values[values.length - 1];
  if (latestDaily > avgDaily * 3) {
    anomalies.push({
      transactionId: `pattern-${userId}`,
      userId,
      type: "PATTERN_DEVIATION",
      riskScore: 60,
      details: `Daily earnings spike: €${(latestDaily / 100).toFixed(2)} vs avg €${(avgDaily / 100).toFixed(2)}`,
      flaggedAt: new Date(),
    });
  }

  return anomalies;
}

export async function monitorTransactions(): Promise<void> {
  const users = await prisma.user.findMany({ where: { role: "FREELANCER" } });
  for (const user of users) {
    const anomalies = [
      ...(await monitorPaymentAnomalies(user.id)),
      ...(await detectPatternDeviation(user.id)),
    ];

    for (const anomaly of anomalies) {
      await prisma.fraudTransactionAnomaly.create({ data: anomaly });
    }
  }
}
