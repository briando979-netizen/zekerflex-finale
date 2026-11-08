import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

export const PLAN_PRICING = {
  STARTER: { monthly: 29, annual: 290 },
  PROFESSIONAL: { monthly: 99, annual: 990 },
  ENTERPRISE: { monthly: 0, annual: 0 }, // Custom pricing
};

export const subscriptionSchema = z.object({
  tenantId: z.string(),
  plan: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
  status: z.enum(["ACTIVE", "PAST_DUE", "CANCELLED"]),
  stripeSubscriptionId: z.string(),
  nextBillingDate: z.date(),
});

export async function createSubscription(
  tenantId: string,
  plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE",
  billingCycle: "MONTHLY" | "ANNUAL"
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw AppError.notFound("Tenant not found");
  }

  const amount = PLAN_PRICING[plan][billingCycle === "MONTHLY" ? "monthly" : "annual"];

  return await prisma.tenantSubscription.create({
    data: {
      tenantId,
      plan,
      billingCycle,
      status: "ACTIVE",
      amount,
      nextBillingDate: getNextBillingDate(billingCycle),
      stripeSubscriptionId: `sub_${Date.now()}`,
    },
  });
}

export async function getSubscription(tenantId: string) {
  return await prisma.tenantSubscription.findUnique({
    where: { tenantId },
  });
}

export async function cancelSubscription(tenantId: string) {
  return await prisma.tenantSubscription.update({
    where: { tenantId },
    data: { status: "CANCELLED" },
  });
}

export async function updateSubscriptionPlan(
  tenantId: string,
  newPlan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE"
) {
  const subscription = await getSubscription(tenantId);

  if (!subscription) {
    throw AppError.notFound("Subscription not found");
  }

  const amount = PLAN_PRICING[newPlan][subscription.billingCycle === "MONTHLY" ? "monthly" : "annual"];

  return await prisma.tenantSubscription.update({
    where: { tenantId },
    data: {
      plan: newPlan,
      amount,
    },
  });
}

export async function recordUsage(
  tenantId: string,
  metricName: string,
  quantity: number
) {
  return await prisma.usageMetric.create({
    data: {
      tenantId,
      metricName,
      quantity,
      recordedAt: new Date(),
    },
  });
}

export async function generateInvoice(tenantId: string) {
  const subscription = await getSubscription(tenantId);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!subscription || !tenant) {
    throw AppError.notFound("Subscription or tenant not found");
  }

  return await prisma.invoice.create({
    data: {
      tenantId,
      amount: subscription.amount,
      status: "PAID",
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paidAt: new Date(),
      stripeInvoiceId: `inv_${Date.now()}`,
    },
  });
}

export async function getMonthlyRecurringRevenue(tenantId: string) {
  const subscription = await getSubscription(tenantId);

  if (!subscription || subscription.status !== "ACTIVE") {
    return 0;
  }

  const monthlyAmount = PLAN_PRICING[subscription.plan].monthly;
  return subscription.billingCycle === "MONTHLY"
    ? monthlyAmount
    : monthlyAmount * 12 / 12; // Annualized
}

export async function listInvoices(tenantId: string, limit = 50) {
  return await prisma.invoice.findMany({
    where: { tenantId },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
}

export async function processUpcomingBillings() {
  const subscriptions = await prisma.tenantSubscription.findMany({
    where: {
      status: "ACTIVE",
      nextBillingDate: {
        lte: new Date(),
      },
    },
  });

  for (const subscription of subscriptions) {
    await generateInvoice(subscription.tenantId);

    await prisma.tenantSubscription.update({
      where: { tenantId: subscription.tenantId },
      data: {
        nextBillingDate: getNextBillingDate(subscription.billingCycle),
      },
    });
  }

  return subscriptions.length;
}

function getNextBillingDate(billingCycle: "MONTHLY" | "ANNUAL"): Date {
  const now = new Date();
  const daysToAdd = billingCycle === "MONTHLY" ? 30 : 365;
  return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
}
