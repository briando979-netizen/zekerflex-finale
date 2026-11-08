import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const feeCalculationSchema = z.object({
  grossAmount: z.number().positive(),
  freelancerId: z.string(),
  shiftId: z.string().optional(),
});

export interface FeeBreakdown {
  grossAmount: number;
  platformFee: number;
  taxWithholding: number;
  insuranceDeduction: number;
  otherDeductions: number;
  netAmount: number;
  currency: string;
}

const PLATFORM_FEE_PERCENT = 0.105; // 10.5% platform fee
const TAX_WITHHOLDING_PERCENT = 0.37; // 37% tax (NL)
const INSURANCE_PERCENT = 0.015; // 1.5% insurance

export async function calculateFees(req: typeof feeCalculationSchema._input): Promise<FeeBreakdown> {
  const validated = feeCalculationSchema.parse(req);

  const freelancer = await prisma.freelancerProfile.findUnique({
    where: { userId: validated.freelancerId },
  });

  if (!freelancer) throw new Error('Freelancer not found');

  const platformFee = validated.grossAmount * PLATFORM_FEE_PERCENT;
  const taxWithholding = validated.grossAmount * TAX_WITHHOLDING_PERCENT;
  const insuranceDeduction = validated.grossAmount * INSURANCE_PERCENT;
  const otherDeductions = 0;

  const netAmount = validated.grossAmount - platformFee - taxWithholding - insuranceDeduction - otherDeductions;

  return {
    grossAmount: validated.grossAmount,
    platformFee: Math.round(platformFee * 100) / 100,
    taxWithholding: Math.round(taxWithholding * 100) / 100,
    insuranceDeduction: Math.round(insuranceDeduction * 100) / 100,
    otherDeductions,
    netAmount: Math.round(netAmount * 100) / 100,
    currency: 'EUR',
  };
}

export async function recordFeeBreakdown(
  payoutId: string,
  breakdown: FeeBreakdown
) {
  return prisma.feeBreakdown.create({
    data: {
      payoutId,
      ...breakdown,
    },
  });
}
