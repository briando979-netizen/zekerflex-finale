import { prisma } from '@/lib/prisma';

export async function getPaymentStatus(transactionId: string) {
  const transaction = await prisma.paymentTransaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) throw new Error('Transaction not found');

  return {
    id: transaction.id,
    status: transaction.status,
    amount: transaction.amount,
    initiatedAt: transaction.initiatedAt,
    completedAt: transaction.completedAt,
    failureReason: transaction.failureReason,
  };
}

export async function getTransactionHistory(
  freelancerId: string,
  limit: number = 50,
  offset: number = 0
) {
  const transactions = await prisma.paymentTransaction.findMany({
    where: { freelancerId },
    orderBy: { initiatedAt: 'desc' },
    take: limit,
    skip: offset,
  });

  const total = await prisma.paymentTransaction.count({
    where: { freelancerId },
  });

  return {
    transactions,
    total,
    limit,
    offset,
  };
}

export async function trackPaymentStatus(transactionId: string, newStatus: string, metadata?: Record<string, unknown>) {
  return prisma.paymentTransaction.update({
    where: { id: transactionId },
    data: {
      status: newStatus,
      metadata,
      updatedAt: new Date(),
    },
  });
}

export async function getOutstandingPayments(freelancerId: string) {
  return prisma.paymentTransaction.findMany({
    where: {
      freelancerId,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
    orderBy: { initiatedAt: 'asc' },
  });
}

export async function getCompletedPayments(freelancerId: string, days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.paymentTransaction.findMany({
    where: {
      freelancerId,
      status: 'COMPLETED',
      completedAt: { gte: since },
    },
    orderBy: { completedAt: 'desc' },
  });
}
