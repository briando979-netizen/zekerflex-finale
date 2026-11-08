import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { z } from 'zod';

const contractSchema = z.object({
  title: z.string().min(1),
  vendorId: z.string(),
  value: z.number().nonnegative(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(['DRAFT','NEGOTIATING','SIGNED','ACTIVE','EXPIRED']),
  templateId: z.string().optional(),
  description: z.string().optional(),
});

export async function createContract(data: z.infer<typeof contractSchema>) {
  return prisma.contract.create({ data: { ...contractSchema.parse(data), version: 1 }, include: { vendor: true, obligations: true } });
}

export async function updateContract(id: string, data: Partial<z.infer<typeof contractSchema>>) {
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) throw AppError.notFound('Contract not found');
  return prisma.contract.update({ where: { id }, data: { ...contractSchema.partial().parse(data), version: contract.version + 1 } });
}

export async function getContract(id: string) {
  return prisma.contract.findUnique({ where: { id }, include: { vendor: true, obligations: true, amendments: true } });
}

export async function searchContracts(query: string) {
  return prisma.contract.findMany({
    where: { OR: [{ title: { contains: query, mode: 'insensitive' } }, { vendor: { name: { contains: query, mode: 'insensitive' } } }] },
    include: { vendor: true },
    take: 50,
  });
}
