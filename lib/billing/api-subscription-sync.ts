import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";

/** First activation of an API subscription — the tenant just completed subscription-mode Checkout. */
export async function activateApiSubscription(session: Stripe.Checkout.Session): Promise<void> {
  const planKey = session.metadata?.planKey;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!planKey || !customerId || !subscriptionId) {
    logger.warn("subscription checkout session missing planKey/customer/subscription", { sessionId: session.id });
    return;
  }

  const tenant = await prisma.tenant.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true, name: true } });
  if (!tenant) {
    logger.warn("subscription checkout session: no tenant for stripeCustomerId", { customerId });
    return;
  }

  await prisma.apiSubscription.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, planKey, status: "active", stripeSubscriptionId: subscriptionId },
    update: { planKey, status: "active", stripeSubscriptionId: subscriptionId },
  });

  await recordAudit({
    category: "BILLING",
    action: "api_subscription.activated",
    actorLabel: "integration:stripe",
    summary: `${tenant.name} heeft het ${planKey}-API-abonnement geactiveerd`,
    targetType: "tenant",
    targetId: tenant.id,
    metadata: { planKey, stripeSubscriptionId: subscriptionId },
  });
}

export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "canceled";
  }
}

/** Plan change or cancellation via the Stripe Billing Portal — keeps our ApiSubscription row in sync. */
export async function syncApiSubscription(
  subscription: Stripe.Subscription,
  eventType: "customer.subscription.updated" | "customer.subscription.deleted",
): Promise<void> {
  const existing = await prisma.apiSubscription.findUnique({ where: { stripeSubscriptionId: subscription.id } });
  if (!existing) {
    logger.warn("subscription lifecycle event for unknown stripeSubscriptionId", { subscriptionId: subscription.id });
    return;
  }

  const status = eventType === "customer.subscription.deleted" ? "canceled" : mapStripeSubscriptionStatus(subscription.status);
  const planKey = subscription.metadata?.planKey ?? existing.planKey;
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000)
    : null;

  await prisma.apiSubscription.update({
    where: { id: existing.id },
    data: { status, planKey, currentPeriodEnd },
  });

  await recordAudit({
    category: "BILLING",
    action: "api_subscription.synced",
    actorLabel: "integration:stripe",
    summary: `API-abonnement van tenant ${existing.tenantId} bijgewerkt naar status ${status}`,
    targetType: "tenant",
    targetId: existing.tenantId,
    metadata: { planKey, status, stripeSubscriptionId: subscription.id },
  });
}
