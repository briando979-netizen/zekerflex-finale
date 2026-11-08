import { prisma } from '@/lib/prisma';

export async function auditSupplier(supplierId: string, score: number) {
  return prisma.supplierESGAudit.create({
    data: { supplierId, score, date: new Date() },
  });
}

export async function getSupplierESGMetrics() {
  const audits = await prisma.supplierESGAudit.findMany();
  const avgScore = audits.reduce((s, a) => s + a.score, 0) / audits.length;

  return {
    averageScore: avgScore,
    compliantSuppliers: audits.filter(a => a.score >= 70).length,
    improvementPlans: audits.filter(a => a.score < 70).length,
  };
}
