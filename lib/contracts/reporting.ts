import { prisma } from '@/lib/prisma';

export async function generateComplianceReport() {
  const obligations = await prisma.contractObligation.findMany({
    include: { contract: { include: { vendor: true } } },
  });

  return {
    total: obligations.length,
    completed: obligations.filter(o => o.status === 'COMPLETED').length,
    overdue: obligations.filter(o => o.status === 'OVERDUE').length,
    compliance: ((obligations.filter(o => o.status === 'COMPLETED').length) / obligations.length) * 100,
  };
}

export async function generateFinancialReport() {
  const contracts = await prisma.contract.findMany({ where: { status: 'ACTIVE' } });
  
  return {
    totalCommitment: contracts.reduce((sum, c) => sum + c.value, 0),
    averageContract: contracts.reduce((sum, c) => sum + c.value, 0) / (contracts.length || 1),
    byVendor: await Promise.all(
      contracts.map(async (c) => ({
        vendor: c.vendorId,
        value: c.value,
        contracts: 1,
      }))
    ),
  };
}

export async function generatePerformanceReport(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { contracts: { include: { obligations: true } } },
  });

  return {
    vendor: vendor?.name,
    rating: vendor?.rating,
    completedContracts: vendor?.contracts.filter(c => c.status === 'COMPLETED').length,
    performanceScore: vendor?.rating ? (vendor.rating / 5) * 100 : 0,
  };
}
