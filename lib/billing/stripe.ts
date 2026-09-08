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
