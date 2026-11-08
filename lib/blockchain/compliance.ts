import { prisma } from '@/lib/prisma';

export async function recordComplianceCheck(txHash: string, entityId: string, framework: string, status: 'compliant' | 'pending-review' | 'non-compliant') {
  return prisma.blockchainComplianceRecord.create({
    data: { transactionHash: txHash, entityId, regulatoryFramework: framework, status, recordedAt: new Date() },
  });
}

export async function verifyRegulatoryCompliance(transactionHash: string) {
  const records = await prisma.blockchainComplianceRecord.findMany({ where: { transactionHash } });
  return {
    transactionHash, compliant: records.every(r => r.status === 'compliant'),
    checks: records.length, frameworks: records.map(r => r.regulatoryFramework),
  };
}

export async function getAuditLog(entityId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  return prisma.blockchainComplianceRecord.findMany({
    where: { entityId, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'desc' },
  });
}
