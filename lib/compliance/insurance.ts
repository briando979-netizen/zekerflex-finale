import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const insuranceSchema = z.object({
  freelancerId: z.string(),
  coverageType: z.enum(['LIABILITY', 'ACCIDENT', 'HEALTH', 'INCOME_PROTECTION', 'PROFESSIONAL_INDEMNITY']),
  provider: z.string(),
  policyNumber: z.string(),
  startDate: z.date(),
  endDate: z.date(),
  premiumMonthly: z.number(),
  coverageAmount: z.number(),
  status: z.enum(['ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED', 'CLAIMED']),
});

export async function enrollInsurance(data: z.infer<typeof insuranceSchema>) {
  const validated = insuranceSchema.parse(data);

  return await prisma.insurance.create({
    data: {
      ...validated,
      status: 'PENDING',
    },
  });
}

export async function verifyInsuranceCoverage(freelancerId: string): Promise<{
  hasActiveCoverage: boolean;
  coverageTypes: string[];
  totalCoverage: number;
  expiresAt?: Date;
}> {
  const policies = await prisma.insurance.findMany({
    where: {
      freelancerId,
      status: 'ACTIVE',
      endDate: { gt: new Date() },
    },
  });

  const totalCoverage = policies.reduce((sum, p) => sum + p.coverageAmount, 0);
  const coverageTypes = [...new Set(policies.map((p) => p.coverageType))];
  const earliestExpiry = policies.length > 0
    ? new Date(Math.min(...policies.map((p) => p.endDate.getTime())))
    : undefined;

  return {
    hasActiveCoverage: policies.length > 0,
    coverageTypes,
    totalCoverage,
    expiresAt: earliestExpiry,
  };
}

export async function fileClaim(insuranceId: string, data: {
  claimType: string;
  description: string;
  amount: number;
  evidenceUrls: string[];
}) {
  const insurance = await prisma.insurance.findUnique({
    where: { id: insuranceId },
  });

  if (!insurance) throw new Error('Insurance policy not found');

  return await prisma.insuranceClaim.create({
    data: {
      insuranceId,
      claimType: data.claimType,
      description: data.description,
      claimAmount: data.amount,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      evidence: data.evidenceUrls,
    },
  });
}

export async function getClaimStatus(claimId: string) {
  return await prisma.insuranceClaim.findUnique({
    where: { id: claimId },
    include: { insurance: true },
  });
}

export async function checkCoverageForShift(freelancerId: string, shiftType: string): Promise<boolean> {
  const coverage = await verifyInsuranceCoverage(freelancerId);

  const requiredCoverage: Record<string, string[]> = {
    construction: ['LIABILITY', 'ACCIDENT'],
    healthcare: ['LIABILITY', 'PROFESSIONAL_INDEMNITY'],
    transport: ['LIABILITY', 'ACCIDENT'],
    general: ['LIABILITY'],
  };

  const required = requiredCoverage[shiftType] || ['LIABILITY'];
  return required.every((type) => coverage.coverageTypes.includes(type));
}
