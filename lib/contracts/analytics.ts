import { prisma } from '@/lib/prisma';

export async function getContractValue(vendorId?: string) {
  const where = vendorId ? { vendorId } : {};
  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE', ...where },
    select: { value: true, currency: true },
  });
  return contracts.reduce((sum, c) => sum + c.value, 0);
}

export async function getRiskAssessment(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { contractId },
    include: { obligations: true, vendor: { include: { performance: true } } },
  });
  if (!contract) return null;

  const overdueObligations = contract.obligations.filter(o => o.status === 'OVERDUE').length;
  const performanceScore = contract.vendor.performance?.avgRating ?? 0;
  const riskScore = (overdueObligations / (contract.obligations.length || 1)) * 50 + (1 - performanceScore / 5) * 50;

  return { riskScore: Math.min(100, riskScore), status: riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW' };
}

export async function getContractMetrics() {
  return {
    activeContracts: await prisma.contract.count({ where: { status: 'ACTIVE' } }),
    totalValue: await getContractValue(),
    renewalsDue: await prisma.contract.count({
      where: { endDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, status: 'ACTIVE' },
    }),
    pendingObligations: await prisma.contractObligation.count({ where: { status: 'PENDING' } }),
  };
}
