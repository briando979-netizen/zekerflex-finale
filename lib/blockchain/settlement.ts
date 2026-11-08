import { prisma } from '@/lib/prisma';

export async function initiateAtomicSwap(party1: string, party2: string, token1Id: string, amount1: bigint, token2Id: string, amount2: bigint) {
  return prisma.atomicSwap.create({
    data: {
      party1, party2, token1Id, amount1: amount1.toString(),
      token2Id, amount2: amount2.toString(), status: 'initiated', initiatedAt: new Date(),
    },
  });
}

export async function executeInstantPayment(from: string, to: string, tokenId: string, amount: bigint) {
  return prisma.instantPayment.create({
    data: { from, to, tokenId, amount: amount.toString(), executedAt: new Date(), status: 'completed' },
  });
}

export async function getSettlementStatus(swapId: string) {
  const swap = await prisma.atomicSwap.findUnique({ where: { id: swapId } });
  return { status: swap?.status, party1: swap?.party1, party2: swap?.party2, initiatedAt: swap?.initiatedAt };
}
