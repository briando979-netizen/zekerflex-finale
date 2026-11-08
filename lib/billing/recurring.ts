import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const subscriptionSchema = z.object({
  userId: z.string(),
  plan: z.enum(['starter', 'pro', 'enterprise']),
  billingCycle: z.enum(['monthly', 'quarterly', 'annual']),
  amount: z.number().positive(),
  status: z.enum(['active', 'paused', 'cancelled']),
});

export async function createSubscription(data: z.infer<typeof subscriptionSchema>) {
  const validated = subscriptionSchema.parse(data);
  return prisma.subscription.create({
    data: {
      ...validated,
      nextBillingDate: getNextBillingDate(validated.billingCycle),
      createdAt: new Date(),
    },
  });
}

export async function createRecurringInvoice(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new Error('Subscription not found');

  const invoice = await prisma.invoice.create({
    data: {
      userId: subscription.userId,
      total: subscription.amount as number,
      status: 'pending',
      subscriptionId,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { nextBillingDate: getNextBillingDate(subscription.billingCycle as string) },
  });

  return invoice;
}

function getNextBillingDate(cycle: string): Date {
  const date = new Date();
  if (cycle === 'monthly') date.setMonth(date.getMonth() + 1);
  else if (cycle === 'quarterly') date.setMonth(date.getMonth() + 3);
  else if (cycle === 'annual') date.setFullYear(date.getFullYear() + 1);
  return date;
}

export async function processSubscriptionBillings() {
  const today = new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: {
      nextBillingDate: { lte: today },
      status: 'active',
    },
  });

  return Promise.all(subscriptions.map(s => createRecurringInvoice(s.id)));
}

export async function cancelSubscription(subscriptionId: string) {
  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });
}

export async function pauseSubscription(subscriptionId: string) {
  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'paused' },
  });
}

export async function recognizeRevenue(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error('Invoice not found');

  return prisma.revenueRecognition.create({
    data: {
      invoiceId,
      amount: invoice.total as number,
      recognizedDate: new Date(),
      method: 'subscription',
    },
  });
}
