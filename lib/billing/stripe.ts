import Stripe from "stripe";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

let client: Stripe | null = null;

/** Lazily constructed so a missing key fails at call time, not at import time. */
function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw AppError.upstream("Stripe is not configured");
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return client;
}

export interface InvoiceCheckoutInput {
  invoiceId: string;
  number: string;
  description: string;
  totalCents: number;
  currency: string;
  billingEmail?: string | null;
}

/**
 * One-off Checkout Session for a single ISSUED invoice. Card + iDEAL +
 * whatever else is enabled on the Stripe account decide themselves via
 * automatic_payment_methods; settlement is confirmed asynchronously by the
 * checkout.session.completed webhook, never by the redirect back here.
 */
export async function createInvoiceCheckoutSession(
  input: InvoiceCheckoutInput,
): Promise<Stripe.Checkout.Session> {
  if (input.totalCents <= 0) {
    throw AppError.validation("Invoice total must be positive to collect payment");
  }
  const stripe = getStripeClient();
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: input.currency.toLowerCase(),
          product_data: {
            name: `Factuur ${input.number}`,
            description: input.description,
          },
          unit_amount: input.totalCents,
        },
        quantity: 1,
      },
    ],
    ...(input.billingEmail ? { customer_email: input.billingEmail } : {}),
    metadata: { invoiceId: input.invoiceId },
    payment_intent_data: { metadata: { invoiceId: input.invoiceId } },
    success_url: `${baseUrl}/werkgever/facturen?paid=${input.invoiceId}`,
    cancel_url: `${baseUrl}/werkgever/facturen?cancelled=${input.invoiceId}`,
  });
}

// ---------------------------------------------------------------------------
// Recurring billing — public API subscriptions (lib/api-plans/catalog.ts).
// Separate from the one-off Checkout above: a subscription needs a
// persistent Stripe Customer (Tenant.stripeCustomerId) to attach the
// recurring Price to, and a Billing Portal link so a tenant can upgrade/
// downgrade/cancel without us building that UI ourselves.
// ---------------------------------------------------------------------------

export interface SubscriptionCheckoutInput {
  stripeCustomerId: string;
  planKey: string;
  planLabel: string;
  priceCentsPerMonth: number;
  successUrl: string;
  cancelUrl: string;
}

/** One-off Checkout Session in subscription mode — price_data is inline, so no Stripe Product/Price needs to exist beforehand. */
export async function createSubscriptionCheckoutSession(
  input: SubscriptionCheckoutInput,
): Promise<Stripe.Checkout.Session> {
  if (input.priceCentsPerMonth <= 0) {
    throw AppError.validation("Subscription price must be positive to collect payment");
  }
  const stripe = getStripeClient();

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: "eur",
          recurring: { interval: "month" },
          product_data: { name: `ZekerFlex API — ${input.planLabel}` },
          unit_amount: input.priceCentsPerMonth,
        },
        quantity: 1,
      },
    ],
    metadata: { planKey: input.planKey },
    subscription_data: { metadata: { planKey: input.planKey } },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

/** Stripe-hosted portal for a tenant to change plan, update payment method, or cancel. */
export async function createBillingPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripeClient();
  return stripe.billingPortal.sessions.create({ customer: stripeCustomerId, return_url: returnUrl });
}

export interface ShopOrderCheckoutInput {
  orderId: string;
  email: string;
  lines: { name: string; priceCents: number; qty: number }[];
  shippingCents: number;
  successUrl: string;
  cancelUrl: string;
}

/**
 * One-off Checkout Session for a /shop order. Line items are re-priced
 * server-side before this is ever called (see app/api/shop/orders/route.ts) —
 * this just reflects that already-trusted total to Stripe.
 */
export async function createShopOrderCheckoutSession(
  input: ShopOrderCheckoutInput,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = input.lines.map((l) => ({
    price_data: {
      currency: "eur",
      product_data: { name: l.name },
      unit_amount: l.priceCents,
    },
    quantity: l.qty,
  }));
  if (input.shippingCents > 0) {
    line_items.push({
      price_data: {
        currency: "eur",
        product_data: { name: "Verzending" },
        unit_amount: input.shippingCents,
      },
      quantity: 1,
    });
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items,
    customer_email: input.email,
    metadata: { shopOrderId: input.orderId },
    payment_intent_data: { metadata: { shopOrderId: input.orderId } },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

/** Get-or-create the Stripe Customer for a tenant, persisting the id. Call inside the caller's own transaction/update if atomicity matters. */
export async function ensureStripeCustomer(input: {
  existingCustomerId: string | null;
  email?: string | null;
  name: string;
  tenantId: string;
}): Promise<string> {
  if (input.existingCustomerId) return input.existingCustomerId;
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    name: input.name,
    ...(input.email ? { email: input.email } : {}),
    metadata: { tenantId: input.tenantId },
  });
  return customer.id;
}

// ---------------------------------------------------------------------------
// Stripe Connect Express — freelancer payout onboarding + transfers.
// ---------------------------------------------------------------------------

/** Creates the freelancer's Express account. Call once; the id is persisted on FreelancerProfile. */
export async function createExpressAccount(input: {
  email: string;
  country?: string;
}): Promise<Stripe.Account> {
  const stripe = getStripeClient();
  return stripe.accounts.create({
    type: "express",
    country: input.country ?? "NL",
    email: input.email,
    business_type: "individual",
    capabilities: { transfers: { requested: true } },
  });
}

/**
 * A single-use onboarding (or re-onboarding) link. Expires after a few
 * minutes, so create it fresh on every "koppel je bankrekening" click rather
 * than caching it.
 */
export async function createAccountOnboardingLink(
  accountId: string,
  urls: { returnUrl: string; refreshUrl: string },
): Promise<Stripe.AccountLink> {
  const stripe = getStripeClient();
  return stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: urls.returnUrl,
    refresh_url: urls.refreshUrl,
  });
}

/** Fresh payouts_enabled / details_submitted straight from Stripe (not the cached DB flag). */
export async function getConnectAccountStatus(
  accountId: string,
): Promise<{ payoutsEnabled: boolean; detailsSubmitted: boolean }> {
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(accountId);
  return {
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
  };
}

/** Lets an already-onboarded freelancer reach their Stripe Express dashboard (payout history, bank details). */
export async function createAccountLoginLink(accountId: string): Promise<string> {
  const stripe = getStripeClient();
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}

export interface ConnectTransferInput {
  endToEndId: string; // idempotency key, mirrors the SEPA path
  amountCents: number;
  currency: string;
  destinationAccountId: string;
  description: string;
}

export interface ConnectTransferResult {
  transferId: string;
}

/**
 * Moves funds from the platform's Stripe balance to the freelancer's connected
 * account. Stripe then pays the connected account out to their bank on its own
 * schedule (or instantly, if Instant Payouts is enabled for that account) — a
 * successful Transfer here means "accepted", not "money in the bank yet".
 */
export async function transferToConnectedAccount(
  input: ConnectTransferInput,
): Promise<ConnectTransferResult> {
  const stripe = getStripeClient();
  const transfer = await stripe.transfers.create(
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      destination: input.destinationAccountId,
      description: input.description,
      transfer_group: input.endToEndId,
    },
    { idempotencyKey: input.endToEndId },
  );
  return { transferId: transfer.id };
}

/** Verifies the Stripe signature and returns the parsed event. Throws on a bad signature. */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw AppError.upstream("Stripe webhook secret is not configured");
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
