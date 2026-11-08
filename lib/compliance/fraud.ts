import { prisma } from '@/lib/prisma';

interface FraudSignals {
  rapidProfileChanges: number;
  suspiciousActivity: number;
  multipleAccounts: number;
  lowCompletionRate: number;
  reportedDisputes: number;
  locationAnomaly: number;
}

export async function calculateFraudScore(freelancerId: string): Promise<number> {
  const signals = await getFraudSignals(freelancerId);

  const weights = {
    rapidProfileChanges: 15,
    suspiciousActivity: 20,
    multipleAccounts: 25,
    lowCompletionRate: 15,
    reportedDisputes: 20,
    locationAnomaly: 5,
  };

  const score =
    (signals.rapidProfileChanges * weights.rapidProfileChanges +
      signals.suspiciousActivity * weights.suspiciousActivity +
      signals.multipleAccounts * weights.multipleAccounts +
      signals.lowCompletionRate * weights.lowCompletionRate +
      signals.reportedDisputes * weights.reportedDisputes +
      signals.locationAnomaly * weights.locationAnomaly) /
    100;

  return Math.min(100, score);
}

async function getFraudSignals(freelancerId: string): Promise<FraudSignals> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: freelancerId },
  });

  const shifts = await prisma.shift.findMany({
    where: { freelancerId },
  });

  const disputes = await prisma.dispute.findMany({
    where: { freelancerId },
  });

  const rapidChanges = profile?.updatedAt
    ? Math.max(0, 1 - (Date.now() - profile.updatedAt.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const completionRate =
    shifts.length > 0 ? shifts.filter((s) => s.status === 'COMPLETED').length / shifts.length : 1;

  return {
    rapidProfileChanges: Math.min(1, rapidChanges * 10),
    suspiciousActivity: 0,
    multipleAccounts: 0,
    lowCompletionRate: completionRate < 0.5 ? 0.8 : 0,
    reportedDisputes: Math.min(1, disputes.length * 0.2),
    locationAnomaly: 0,
  };
}

export async function flagProfile(freelancerId: string, reason: string) {
  const result = await prisma.fraudFlag.create({
    data: {
      freelancerId,
      reason,
      status: 'FLAGGED',
    },
  });

  return result;
}

export async function getFraudStatus(freelancerId: string) {
  const score = await calculateFraudScore(freelancerId);
  const flags = await prisma.fraudFlag.findMany({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' },
  });

  return {
    freelancerId,
    fraudScore: score,
    riskLevel: score > 70 ? 'HIGH' : score > 40 ? 'MEDIUM' : 'LOW',
    flags,
  };
}
