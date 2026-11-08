import { prisma } from '@/lib/prisma';

export interface RetentionPrediction {
  workerId: string;
  churnRiskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  daysInactive: number;
  recommendedAction: string;
}

export async function predictChurnRisk(workerId: string): Promise<RetentionPrediction> {
  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId: workerId },
    include: { user: true },
  });

  if (!freelancer) {
    return {
      workerId,
      churnRiskScore: 0,
      riskLevel: 'LOW',
      daysInactive: 0,
      recommendedAction: 'No data',
    };
  }

  const lastAssignment = await prisma.assignment.findFirst({
    where: { freelancerId: workerId },
    orderBy: { completedAt: 'desc' },
  });

  const now = new Date();
  const lastActive = lastAssignment?.completedAt || freelancer.user?.createdAt || now;
  const daysInactive = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

  let churnRiskScore = 0;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

  if (daysInactive > 90) {
    churnRiskScore = 0.8;
    riskLevel = 'HIGH';
  } else if (daysInactive > 30) {
    churnRiskScore = 0.5;
    riskLevel = 'MEDIUM';
  } else if (daysInactive > 7) {
    churnRiskScore = 0.2;
    riskLevel = 'LOW';
  }

  const recentDeclines = await prisma.assignment.count({
    where: { freelancerId: workerId, status: 'DECLINED', createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });

  if (recentDeclines > 3) {
    churnRiskScore += 0.15;
    riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : 'HIGH';
  }

  let recommendedAction = 'Continue monitoring';
  if (riskLevel === 'HIGH') {
    recommendedAction = 'Send re-engagement campaign + personalized offer';
  } else if (riskLevel === 'MEDIUM') {
    recommendedAction = 'Send reminder + bonus incentive offer';
  }

  return {
    workerId,
    churnRiskScore: Math.min(1, Math.round(churnRiskScore * 100) / 100),
    riskLevel,
    daysInactive,
    recommendedAction,
  };
}
