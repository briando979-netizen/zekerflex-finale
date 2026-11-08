import Stripe from "stripe";
import { z } from "zod";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-2.acacia",
});

export const paymentMethodSchema = z.enum(["card", "bank_transfer", "paypal", "apple_pay", "google_pay"]);

export async function createStripeCustomer(userId: string, email: string, metadata?: Record<string, string>) {
  return stripe.customers.create({
    email,
    metadata: {
      userId,
      ...metadata,
    },
  });
}

export async function createSubscription(
  customerId: string,
  priceId: string,
  metadata?: Record<string, string>,
) {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    metadata,
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });
}

export async function updateSubscription(subscriptionId: string, priceId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.items.data.length === 0) {
    throw new Error("Subscription has no items");
  }

  return stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: priceId,
      },
    ],
    proration_behavior: "create_prorations",
  });
}

export async function cancelSubscription(subscriptionId: string, atPeriodEnd = true) {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: atPeriodEnd,
  });
}

export async function createInvoice(
  customerId: string,
  items: Array<{ priceId: string; quantity: number }>,
) {
  const invoice = await stripe.invoices.create({
    customer: customerId,
    auto_advance: false,
  });

  for (const item of items) {
    await stripe.invoiceItems.create({
      invoice: invoice.id,
      price: item.priceId,
      quantity: item.quantity,
    });
  }

  return stripe.invoices.finalize(invoice.id);
}

export async function handleWebhook(body: string | Buffer, sig: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("Webhook secret not configured");

  return stripe.webhooks.constructEvent(body, sig, webhookSecret);
}

export async function getPaymentMethods(customerId: string) {
  return stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
  });
}

export async function setupPaymentMethod(customerId: string) {
  return stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
  });
}

export async function chargeCustomer(
  customerId: string,
  amountCents: number,
  metadata?: Record<string, string>,
) {
  return stripe.paymentIntents.create({
    customer: customerId,
    amount: amountCents,
    currency: "eur",
    confirm: true,
    off_session: true,
    metadata,
  });
}

export const subscriptionWebhookSchema = z.object({
  type: z.enum([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ]),
  data: z.object({
    object: z.record(z.unknown()),
  }),
});
