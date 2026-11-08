import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const instantPayoutSchema = z.object({
  freelancerId: z.string(),
  amount: z.number().positive(),
  bankAccountId: z.string(),
  requestedAt: z.date().optional(),
});

export type InstantPayoutRequest = z.infer<typeof instantPayoutSchema>;

export async function requestInstantPayout(req: InstantPayoutRequest) {
  const validated = instantPayoutSchema.parse(req);

  const bankAccount = await prisma.bankAccount.findUnique({
    where: { id: validated.bankAccountId },
  });

  if (!bankAccount || bankAccount.freelancerId !== validated.freelancerId) {
    throw new Error('Bank account not found or unauthorized');
  }

  if (!bankAccount.verified) {
    throw new Error('Bank account not verified for instant payout');
  }

  const payout = await prisma.instantPayout.create({
    data: {
      freelancerId: validated.freelancerId,
      amount: validated.amount,
      bankAccountId: validated.bankAccountId,
      status: 'PENDING',
      requestedAt: validated.requestedAt || new Date(),
    },
  });

  return payout;
}

export async function processPayout(payoutId: string) {
  const payout = await prisma.instantPayout.findUnique({
    where: { id: payoutId },
    include: { bankAccount: true },
  });

  if (!payout) throw new Error('Payout not found');
  if (payout.status !== 'PENDING') throw new Error('Payout already processed');

  const updated = await prisma.instantPayout.update({
    where: { id: payoutId },
    data: {
      status: 'PROCESSING',
      processedAt: new Date(),
    },
  });

  // Simulate bank transfer (in production: Stripe/payment provider)
  await new Promise(resolve => setTimeout(resolve, 500));

  return await prisma.instantPayout.update({
    where: { id: payoutId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
}

export async function getPayoutHistory(freelancerId: string) {
  return prisma.instantPayout.findMany({
    where: { freelancerId },
    orderBy: { requestedAt: 'desc' },
  });
}
