import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const vendorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  category: z.string(),
  rating: z.number().min(0).max(5).optional(),
  status: z.enum(['ACTIVE','INACTIVE','BLOCKED']),
});

export async function createVendor(data: z.infer<typeof vendorSchema>) {
  return prisma.vendor.create({ data: vendorSchema.parse(data) });
}

export async function rateVendor(vendorId: string, rating: number, comment: string) {
  const existing = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!existing) return null;

  const newAvg = (((existing.rating || 0) * (existing.reviewCount || 0)) + rating) / ((existing.reviewCount || 0) + 1);

  return prisma.vendor.update({
    where: { id: vendorId },
    data: { rating: newAvg, reviewCount: (existing.reviewCount || 0) + 1 },
  });
}

export async function getVendorPerformance(vendorId: string) {
  const contracts = await prisma.contract.findMany({
    where: { vendorId, status: { in: ['COMPLETED','ACTIVE'] } },
    include: { obligations: true },
  });

  return {
    totalContracts: contracts.length,
    totalValue: contracts.reduce((sum, c) => sum + c.value, 0),
    obligationMetrics: {
      completed: contracts.reduce((sum, c) => sum + c.obligations.filter(o => o.status === 'COMPLETED').length, 0),
      overdue: contracts.reduce((sum, c) => sum + c.obligations.filter(o => o.status === 'OVERDUE').length, 0),
    },
  };
}
