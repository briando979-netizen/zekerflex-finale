import Stripe from "stripe";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { eisBetalenAan, zetBetalenUit } from "@/lib/billing/stripe-betalen";
import { isBetalenUitFout } from "@/lib/billing/stripe-betalen-stand";
import { actiefWebhookGeheimUitGeheugen, actieveStripeSleutelUitGeheugen } from "@/lib/billing/stripe-account";

let client: Stripe | null = null;
let clientSleutel: string | null = null;

/**
 * Lazily constructed so a missing key fails at call time, not at import time. De sleutel uit Beheer → Stripe-account
 * (verzegeld, lib/billing/stripe-account.ts) gaat voor; zonder die keuze geldt STRIPE_SECRET_KEY uit .env.
 */
export function getStripeClient(): Stripe {
  const sleutel = actieveStripeSleutelUitGeheugen() ?? env.STRIPE_SECRET_KEY;
  if (!sleutel) {
    throw AppError.upstream("Stripe is nog niet ingericht.");
  }
  if (!client || clientSleutel !== sleutel) {
    client = new Stripe(sleutel);
    clientSleutel = sleutel;
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
  /** Site paths to return to; default the employer invoice page (which needs a login). */
  successPath?: string;
  cancelPath?: string;
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
    throw AppError.validation("Het factuurbedrag moet groter dan 0 zijn om te kunnen innen.");
  }
  await eisBetalenAan();
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
    success_url: `${baseUrl}${input.successPath ?? `/werkgever/facturen?paid=${input.invoiceId}`}`,
    cancel_url: `${baseUrl}${input.cancelPath ?? `/werkgever/facturen?cancelled=${input.invoiceId}`}`,
  });
}

export interface BulkInvoiceCheckoutInput {
  invoices: { invoiceId: string; number: string; description: string; totalCents: number }[];
  currency: string;
  billingEmail?: string | null;
}

/**
 * One Checkout Session covering several ISSUED invoices at once ("Direct
 * betalen" op /werkgever/facturen) — one line item per invoice, so the
 * amount the employer sees always matches the invoice breakdown. The webhook
 * reads `metadata.invoiceIds` (a JSON array) and marks each one paid.
 */
export async function createBulkInvoiceCheckoutSession(
  input: BulkInvoiceCheckoutInput,
): Promise<Stripe.Checkout.Session> {
  if (input.invoices.length === 0) {
    throw AppError.validation("Geen facturen geselecteerd");
  }
  if (input.invoices.some((i) => i.totalCents <= 0)) {
    throw AppError.validation("Het factuurbedrag moet groter dan 0 zijn om te kunnen innen.");
  }
  await eisBetalenAan();
  const stripe = getStripeClient();
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");
  const invoiceIds = input.invoices.map((i) => i.invoiceId);

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: input.invoices.map((i) => ({
      price_data: {
        currency: input.currency.toLowerCase(),
        product_data: { name: `Factuur ${i.number}`, description: i.description },
        unit_amount: i.totalCents,
      },
      quantity: 1,
    })),
    ...(input.billingEmail ? { customer_email: input.billingEmail } : {}),
    metadata: { invoiceIds: JSON.stringify(invoiceIds) },
    payment_intent_data: { metadata: { invoiceIds: JSON.stringify(invoiceIds) } },
    success_url: `${baseUrl}/werkgever/facturen?paid=bulk`,
    cancel_url: `${baseUrl}/werkgever/facturen?cancelled=bulk`,
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
    throw AppError.validation("De abonnementsprijs moet groter dan 0 zijn om te kunnen innen.");
  }
  await eisBetalenAan();
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

export interface WebsiteManagementCheckoutInput {
  stripeCustomerId: string;
  tenantId: string;
  plan: string;
  planLabel: string;
  priceCentsPerMonth: number;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Subscription-mode Checkout voor het "Website-beheer"-abonnement. Zelfde
 * inline-price_data-patroon als de API-abonnementen, maar met eigen metadata
 * (`managedWebsiteTenantId`) zodat de webhook het naar lib/website/manage kan
 * routeren i.p.v. de API-abonnement-sync.
 */
export async function createWebsiteManagementCheckoutSession(
  input: WebsiteManagementCheckoutInput,
): Promise<Stripe.Checkout.Session> {
  if (input.priceCentsPerMonth <= 0) {
    throw AppError.validation("De abonnementsprijs moet groter dan 0 zijn om te kunnen innen.");
  }
  await eisBetalenAan();
  const stripe = getStripeClient();
  const metadata = { managedWebsiteTenantId: input.tenantId, websitePlan: input.plan };

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: "eur",
          recurring: { interval: "month" },
          product_data: { name: `ZekerFlex Websitebeheer — ${input.planLabel}` },
          unit_amount: input.priceCentsPerMonth,
        },
        quantity: 1,
      },
    ],
    metadata,
    subscription_data: { metadata },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

/** Stripe-hosted portal for a tenant to change plan, update payment method, or cancel. */
export interface NetwerkCheckoutInput {
  stripeCustomerId: string;
  tenantId: string;
  module: string;
  naam: string;
  aantal: number;
  variant?: string;
  unitAmountCents: number;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Abonnement voor een netwerkpakket (lib/netwerk/abonnement.ts): wifi per
 * vestiging, VPN per gebruiker of voor het hele bedrijf. Zelfde opzet als
 * Website-beheer; de metadata `netwerkTenantId` stuurt de webhook naar
 * activeerNetwerkModule.
 */
export async function createNetwerkCheckoutSession(input: NetwerkCheckoutInput): Promise<Stripe.Checkout.Session> {
  if (input.unitAmountCents <= 0) throw AppError.validation("De abonnementsprijs moet groter dan 0 zijn om te kunnen innen.");
  await eisBetalenAan();
  const stripe = getStripeClient();
  const metadata = {
    netwerkTenantId: input.tenantId,
    netwerkModule: input.module,
    netwerkAantal: String(input.aantal),
    ...(input.variant ? { netwerkVariant: input.variant } : {}),
  };
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: "eur",
          recurring: { interval: "month" },
          product_data: { name: input.naam },
          unit_amount: input.unitAmountCents,
        },
        quantity: input.aantal,
      },
    ],
    metadata,
    subscription_data: { metadata },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

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
  await eisBetalenAan();
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
    // De shop belooft op meerdere plekken een "WELKOM10"-kortingscode bij
    // nieuwsbrief-inschrijving — zonder dit vinkje heeft Checkout geen veld
    // om die code in te vullen, dus de belofte zou nergens inlosbaar zijn.
    allow_promotion_codes: true,
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
  // zoals de andere Stripe-functies hier: staat betalen uit, dan een 423 BETALEN_UIT en geen poging bij Stripe
  await eisBetalenAan();
  const stripe = getStripeClient();
  try {
    return await stripe.accounts.create({
      type: "express",
      country: input.country ?? "NL",
      email: input.email,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
    });
  } catch (err) {
    // "You cannot create new accounts because your account has been rejected" (12 nov, foutenlogboek): geen kale 500
    // maar de vlag zetten en een rustige 423, zodat de schermen "tijdelijk uit" tonen
    if (isBetalenUitFout(err)) {
      await zetBetalenUit((err as Error).message ?? "account rejected").catch(() => undefined);
      throw AppError.betalenUit();
    }
    throw err;
  }
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

/**
 * Checkout Session that tops up a ZekerFlex Bank account. The webhook books
 * the credit (metadata.bankAccountId) — never the redirect back.
 */
/** iDEAL/card for someone paying a ZekerFlex Bank betaalverzoek without an account. */
export async function createBankRequestSession(input: {
  requestId: string;
  bankAccountId: string;
  holderName: string;
  amountCents: number;
  description: string;
}): Promise<Stripe.Checkout.Session> {
  await eisBetalenAan();
  const stripe = getStripeClient();
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");
  const metadata = { bankAccountId: input.bankAccountId, bankRequestId: input.requestId };
  return stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `Betaalverzoek ${input.holderName}`.slice(0, 120), ...(input.description ? { description: input.description.slice(0, 200) } : {}) },
            unit_amount: input.amountCents,
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${baseUrl}/betaalverzoek/${input.requestId}?betaald=1`,
      cancel_url: `${baseUrl}/betaalverzoek/${input.requestId}`,
    },
    { idempotencyKey: `zf-request:${input.requestId}:${Math.floor(Date.now() / 600_000)}` },
  );
}

export async function createBankTopupSession(input: {
  bankAccountId: string;
  accountNumber: string;
  amountCents: number;
  email?: string | null;
  returnPath: string;
}): Promise<Stripe.Checkout.Session> {
  if (input.amountCents < 500 || input.amountCents > 500_000) {
    throw AppError.validation("Opwaarderen kan van € 5 tot € 5.000");
  }
  await eisBetalenAan();
  const stripe = getStripeClient();
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");
  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: "Opwaarderen ZekerFlex Bank", description: `Rekening ${input.accountNumber}` },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    ...(input.email ? { customer_email: input.email } : {}),
    metadata: { bankAccountId: input.bankAccountId },
    payment_intent_data: { metadata: { bankAccountId: input.bankAccountId } },
    success_url: `${baseUrl}${input.returnPath}?opgewaardeerd=1`,
    cancel_url: `${baseUrl}${input.returnPath}`,
  });
}

/** Verifies the Stripe signature and returns the parsed event. Throws on a bad signature. */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  // eerst het geheim van het account uit Beheer, dan dat uit .env: zolang er nog gebeurtenissen van het vorige account
  // komen, klopt de handtekening met het oude geheim
  const geheimen = [...new Set([actiefWebhookGeheimUitGeheugen(), env.STRIPE_WEBHOOK_SECRET].filter((g): g is string => Boolean(g)))];
  if (geheimen.length === 0) {
    throw AppError.upstream("Het Stripe-webhook-secret is niet ingesteld.");
  }
  const stripe = getStripeClient();
  let laatste: unknown = null;
  for (const geheim of geheimen) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, geheim);
    } catch (err) {
      laatste = err;
    }
  }
  throw laatste;
}
