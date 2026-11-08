import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const obligationSchema = z.object({
  contractId: z.string(),
  description: z.string(),
  dueDate: z.coerce.date(),
  status: z.enum(['PENDING','IN_PROGRESS','COMPLETED','OVERDUE']),
  priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']),
});

export async function createObligation(data: z.infer<typeof obligationSchema>) {
  return prisma.contractObligation.create({ data: obligationSchema.parse(data) });
}

export async function getUpcomingObligations(days: number = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  return prisma.contractObligation.findMany({
    where: { dueDate: { lte: futureDate }, status: { in: ['PENDING','OVERDUE'] } },
    include: { contract: { include: { vendor: true } } },
    orderBy: { dueDate: 'asc' },
  });
}

export async function getRenewalAlerts() {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return prisma.contract.findMany({
    where: { endDate: { lte: thirtyDaysFromNow, gte: new Date() }, status: 'ACTIVE' },
    include: { vendor: true },
  });
}

export async function createAuditLog(contractId: string, action: string, details: string) {
  return prisma.contractAuditLog.create({
    data: { contractId, action, details, timestamp: new Date() },
  });
}
