import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const contractSchema = z.object({
  freelancerId: z.string(),
  shiftId: z.string(),
  contractType: z.enum(['SHIFT_AGREEMENT', 'MASTER_SERVICE', 'NDA', 'CONFIDENTIALITY']),
  terms: z.string(),
  startDate: z.date(),
  endDate: z.date().optional(),
  hourlyRate: z.number().positive(),
  status: z.enum(['DRAFT', 'SENT', 'SIGNED', 'EXECUTED', 'TERMINATED', 'EXPIRED']),
});

export async function createContract(data: z.infer<typeof contractSchema>) {
  const validated = contractSchema.parse(data);

  return await prisma.contract.create({
    data: {
      ...validated,
      status: 'DRAFT',
      createdAt: new Date(),
    },
  });
}

export async function signContract(contractId: string, signatureData: {
  freelancerSignature: string;
  signedAt: Date;
  ipAddress: string;
}) {
  return await prisma.contract.update({
    where: { id: contractId },
    data: {
      status: 'SIGNED',
      freelancerSignature: signatureData.freelancerSignature,
      signedAt: signatureData.signedAt,
      signatureIp: signatureData.ipAddress,
    },
  });
}

export async function getContractsByFreelancer(freelancerId: string) {
  return await prisma.contract.findMany({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function validateContractTerms(contractId: string): Promise<{
  valid: boolean;
  warnings: string[];
}> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { freelancer: true, shift: true },
  });

  if (!contract) throw new Error('Contract not found');

  const warnings: string[] = [];

  if (contract.endDate && contract.endDate < contract.startDate) {
    warnings.push('End date is before start date');
  }

  if (contract.hourlyRate < 12.27) {
    warnings.push('Hourly rate below Dutch minimum wage');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
