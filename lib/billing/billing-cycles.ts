/**
 * Billing Cycles Subsystem
 * Handles auto-recurring billing, monthly cycles, custom periods, proration
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export interface BillingCycleConfig {
  tenantId: string;
  frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "CUSTOM";
  dayOfMonth?: number; // 1-28 for monthly billing
  customIntervalDays?: number; // for CUSTOM frequency
  startDate: Date;
  endDate?: Date;
}

export interface ProratedAmount {
  baseCents: number;
  daysInCycle: number;
  daysUsed: number;
  proratedCents: number;
}

/** Calculate prorated amount for partial cycle */
export function calculateProration(
  baseCents: number,
  startDate: Date,
  endDate: Date,
  cycleStartDate: Date,
  cycleEndDate: Date,
): ProratedAmount {
  // Actual usage period
  const usageStart = new Date(
    Math.max(startDate.getTime(), cycleStartDate.getTime()),
  );
  const usageEnd = new Date(
    Math.min(endDate.getTime(), cycleEndDate.getTime()),
  );

  if (usageEnd <= usageStart) {
    return {
      baseCents,
      daysInCycle: 0,
      daysUsed: 0,
      proratedCents: 0,
    };
  }

  const daysInCycle = Math.ceil(
    (cycleEndDate.getTime() - cycleStartDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysUsed = Math.ceil(
    (usageEnd.getTime() - usageStart.getTime()) / (1000 * 60 * 60 * 24),
  );

  const proratedCents = Math.round((baseCents * daysUsed) / daysInCycle);

  return {
    baseCents,
    daysInCycle,
    daysUsed,
    proratedCents,
  };
}

/** Calculate next billing date based on cycle configuration */
export function calculateNextBillingDate(
  config: BillingCycleConfig,
  currentDate: Date = new Date(),
): Date {
  const date = new Date(currentDate);

  switch (config.frequency) {
    case "MONTHLY":
      const dayOfMonth = config.dayOfMonth ?? 1;
      date.setMonth(date.getMonth() + 1);
      date.setDate(dayOfMonth);
      return date;

    case "QUARTERLY":
      date.setMonth(date.getMonth() + 3);
      date.setDate(config.dayOfMonth ?? 1);
      return date;

    case "ANNUAL":
      date.setFullYear(date.getFullYear() + 1);
      date.setDate(config.dayOfMonth ?? 1);
      return date;

    case "CUSTOM":
      if (!config.customIntervalDays) {
        throw AppError.validation(
          "CUSTOM频率 vereist customIntervalDays parameter.",
        );
      }
      date.setDate(date.getDate() + config.customIntervalDays);
      return date;

    default:
      throw AppError.validation(`Onbekende frequentie: ${config.frequency}`);
  }
}

/** Get all billing cycles due for generation */
export async function getBillingCyclesDue(
  asOf: Date = new Date(),
): Promise<
  Array<{
    tenantId: string;
    subscriptionId: string;
    cycleStart: Date;
    cycleEnd: Date;
  }>
> {
  const subscriptions = await prisma.apiSubscription.findMany({
    where: {
      active: true,
      nextBillingDate: { lte: asOf },
    },
    include: { tenant: true },
  });

  return subscriptions.map((sub) => ({
    tenantId: sub.tenantId,
    subscriptionId: sub.id,
    cycleStart: new Date(sub.lastBillingDate ?? sub.createdAt),
    cycleEnd: new Date(sub.nextBillingDate),
  }));
}

/** Generate invoice for a billing cycle */
export async function generateBillingCycleInvoice(
  subscriptionId: string,
): Promise<string> {
  const subscription = await prisma.apiSubscription.findUnique({
    where: { id: subscriptionId },
    include: { tenant: true },
  });

  if (!subscription) {
    throw AppError.notFound("Abonnement niet gevonden.");
  }

  if (!subscription.active) {
    throw AppError.validation(
      "Kan factuur niet genereren voor inactief abonnement.",
    );
  }

  const plan = await getPlanForSubscription(subscription.id);
  if (!plan) {
    throw AppError.notFound("Plan niet gevonden voor abonnement.");
  }

  // Calculate prorated amount if needed
  const cycleStart = subscription.lastBillingDate ?? subscription.createdAt;
  const cycleEnd = subscription.nextBillingDate;

  const shouldProrate =
    subscription.lastBillingDate === null ||
    (subscription.cancelledAt &&
      subscription.cancelledAt > cycleStart &&
      subscription.cancelledAt < cycleEnd);

  let chargeAmount = plan.priceCents;

  if (shouldProrate) {
    const proratedStart = subscription.lastBillingDate ?? cycleStart;
    const proratedEnd = subscription.cancelledAt ?? cycleEnd;
    const proration = calculateProration(
      plan.priceCents,
      proratedStart,
      proratedEnd,
      cycleStart,
      cycleEnd,
    );
    chargeAmount = proration.proratedCents;
  }

  // Create invoice
  const { createInvoice } = await import("@/lib/billing/invoices");
  const invoiceId = await createInvoice({
    type: "API_SUBSCRIPTION",
    issuerTenantId: process.env.PLATFORM_TENANT_ID,
    recipientTenantId: subscription.tenantId,
    currency: "EUR",
    vatTreatment: "STANDARD",
    vatRate: 0.21,
    lines: [
      {
        description: `API Abonnement - ${plan.name} (${cycleStart.toISOString().split("T")[0]} tot ${cycleEnd.toISOString().split("T")[0]})`,
        quantity: 1,
        unitPriceCents: chargeAmount,
      },
    ],
    issuedAt: new Date(),
  });

  // Update subscription with new billing dates
  await prisma.apiSubscription.update({
    where: { id: subscriptionId },
    data: {
      lastBillingDate: cycleEnd,
      nextBillingDate: calculateNextBillingDate(
        {
          tenantId: subscription.tenantId,
          frequency: plan.billingFrequency as any,
          dayOfMonth: 1,
          startDate: cycleEnd,
        },
        cycleEnd,
      ),
    },
  });

  return invoiceId;
}

/** Get subscription plan details */
async function getPlanForSubscription(
  subscriptionId: string,
): Promise<{
  name: string;
  priceCents: number;
  billingFrequency: string;
} | null> {
  const subscription = await prisma.apiSubscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription?.planId) return null;

  // Look up plan in system (stored in config or database)
  const plans = getPlansCatalog();
  return plans.find((p) => p.id === subscription.planId) ?? null;
}

function getPlansCatalog() {
  return [
    {
      id: "starter",
      name: "Starter",
      priceCents: 9900, // €99
      billingFrequency: "MONTHLY",
    },
    {
      id: "professional",
      name: "Professional",
      priceCents: 29900, // €299
      billingFrequency: "MONTHLY",
    },
    {
      id: "enterprise",
      name: "Enterprise",
      priceCents: 99900, // €999
      billingFrequency: "MONTHLY",
    },
  ];
}

/** Handle subscription cancellation with prorated refund */
export async function cancelSubscription(
  subscriptionId: string,
  cancellationReason?: string,
): Promise<void> {
  const subscription = await prisma.apiSubscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    throw AppError.notFound("Abonnement niet gevonden.");
  }

  if (!subscription.active) {
    throw AppError.validation("Abonnement is al geannuleerd.");
  }

  await prisma.apiSubscription.update({
    where: { id: subscriptionId },
    data: {
      active: false,
      cancelledAt: new Date(),
    },
  });

  // If mid-cycle, generate prorated credit
  if (
    subscription.nextBillingDate &&
    subscription.nextBillingDate > new Date()
  ) {
    // Calculate refund for unused portion
    const plan = await getPlanForSubscription(subscriptionId);
    if (plan) {
      const cycleStart = subscription.lastBillingDate ?? subscription.createdAt;
      const cycleEnd = subscription.nextBillingDate;
      const now = new Date();

      const proration = calculateProration(
        plan.priceCents,
        now,
        cycleEnd,
        cycleStart,
        cycleEnd,
      );

      if (proration.proratedCents > 0) {
        await prisma.tenantCredit.create({
          data: {
            tenantId: subscription.tenantId,
            amountCents: proration.proratedCents,
            reason: `Prorated refund on subscription cancellation: ${cancellationReason ?? "no reason provided"}`,
            sourceClaimId: subscriptionId,
          },
        });
      }
    }
  }
}

/** Reactivate cancelled subscription */
export async function reactivateSubscription(
  subscriptionId: string,
): Promise<void> {
  const subscription = await prisma.apiSubscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    throw AppError.notFound("Abonnement niet gevonden.");
  }

  if (subscription.active) {
    throw AppError.validation("Abonnement is al actief.");
  }

  const nextBillingDate = calculateNextBillingDate(
    {
      tenantId: subscription.tenantId,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date(),
    },
    new Date(),
  );

  await prisma.apiSubscription.update({
    where: { id: subscriptionId },
    data: {
      active: true,
      cancelledAt: null,
      nextBillingDate,
    },
  });
}
