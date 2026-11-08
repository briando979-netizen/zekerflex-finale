import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const fraudCheckSchema = z.object({
  freelancerId: z.string(),
  payoutAmount: z.number(),
  bankAccountId: z.string(),
  ipAddress: z.string().optional(),
});

export interface FraudScore {
  score: number; // 0-100, higher = more fraud risk
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  factors: string[];
}

export async function checkFraudRisk(req: z.infer<typeof fraudCheckSchema>): Promise<FraudScore> {
  const validated = fraudCheckSchema.parse(req);

  const factors: string[] = [];
  let score = 0;

  // Check 1: Payout history
  const recentPayouts = await prisma.instantPayout.findMany({
    where: {
      freelancerId: validated.freelancerId,
      completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
    },
  });

  if (recentPayouts.length > 5) {
    factors.push('High frequency of payouts');
    score += 20;
  }

  // Check 2: Amount anomaly
  const avgPayout = await prisma.instantPayout.aggregate({
    where: { freelancerId: validated.freelancerId },
    _avg: { amount: true },
  });

  if (avgPayout._avg.amount && validated.payoutAmount > avgPayout._avg.amount * 3) {
    factors.push('Payout amount significantly exceeds average');
    score += 25;
  }

  // Check 3: New bank account
  const bankAccount = await prisma.bankAccount.findUnique({
    where: { id: validated.bankAccountId },
  });

  if (bankAccount && new Date().getTime() - bankAccount.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
    factors.push('Bank account recently added');
    score += 15;
  }

  // Check 4: Collusion pattern (multiple freelancers to same account)
  const accountUsage = await prisma.bankAccount.findUnique({
    where: { id: validated.bankAccountId },
  });

  if (accountUsage && accountUsage.freelancerId !== validated.freelancerId) {
    factors.push('Suspicious account linkage pattern');
    score += 30;
  }

  // Determine risk level
  const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = score < 30 ? 'LOW' : score < 60 ? 'MEDIUM' : 'HIGH';

  return { score, riskLevel, factors };
}

export async function validateBankAccount(bankAccountId: string): Promise<boolean> {
  const bankAccount = await prisma.bankAccount.findUnique({
    where: { id: bankAccountId },
  });

  if (!bankAccount) return false;

  // Check PCI compliance
  if (!bankAccount.verified) return false;

  // Check if account is active
  if (bankAccount.status !== 'ACTIVE') return false;

  return true;
}

export async function logPaymentSecurity(
  payoutId: string,
  fraudScore: FraudScore,
  approved: boolean
) {
  return prisma.paymentSecurityLog.create({
    data: {
      payoutId,
      fraudScore: fraudScore.score,
      riskLevel: fraudScore.riskLevel,
      factors: fraudScore.factors,
      approved,
      timestamp: new Date(),
    },
  });
}

export async function getSecurityIncidents(days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.paymentSecurityLog.findMany({
    where: {
      riskLevel: { in: ['MEDIUM', 'HIGH'] },
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'desc' },
  });
}
