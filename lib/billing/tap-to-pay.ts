import Stripe from "stripe";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { getStripeClient } from "@/lib/billing/stripe";
import { logger } from "@/lib/logger";

/**
 * Stripe Tap to Pay: contactless/NFC card payments for all businesses.
 * Accessible via mobile/tablet browser. Reader location = tenant's branch location.
 * Works with Stripe Terminal API but primarily via web implementation.
 */

export interface TapToPaySession {
  id: string;
  clientSecret: string;
  amountCents: number;
  currency: string;
  description: string;
  status: "waiting" | "processing" | "completed" | "failed" | "cancelled";
}

export interface TapToPayConfig {
  tenantId: string;
  branchId: string;
  enabled: boolean;
  stripeAccountId: string | null;
}

/**
 * Check if a tenant can use Tap to Pay (has Stripe Connect account).
 */
export async function canUseTapToPay(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeConnectAccountId: true },
  });
  return !!tenant?.stripeConnectAccountId;
}

/**
 * Get or create a Tap to Pay configuration for a branch.
 */
export async function getTapToPayConfig(branchId: string): Promise<TapToPayConfig | null> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, tenantId: true, tenant: { select: { stripeConnectAccountId: true } } },
  });

  if (!branch) return null;

  return {
    tenantId: branch.tenantId,
    branchId: branch.id,
    enabled: !!branch.tenant.stripeConnectAccountId,
    stripeAccountId: branch.tenant.stripeConnectAccountId,
  };
}

/**
 * Create a payment intent for Tap to Pay. The client calls this to initiate
 * a tap/contactless payment on their mobile device or tablet.
 */
export async function createTapToPayIntent(input: {
  tenantId: string;
  branchId: string;
  amountCents: number;
  description: string;
  orderId?: string;
  metadata?: Record<string, string>;
}): Promise<TapToPaySession> {
  const config = await getTapToPayConfig(input.branchId);
  if (!config || !config.enabled) {
    throw AppError.precondition("Tap to Pay is niet ingeschakeld voor deze locatie.");
  }

  if (config.tenantId !== input.tenantId) {
    throw AppError.forbidden("Branch hoort niet bij deze organisatie.");
  }

  if (input.amountCents <= 0) {
    throw AppError.validation("Bedrag moet groter dan 0 zijn.");
  }

  const stripe = getStripeClient();

  try {
    // Create a payment intent on the connected account
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: "eur",
        description: input.description,
        statement_descriptor: "ZekerFlex",
        metadata: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          orderId: input.orderId || "",
          ...input.metadata,
        },
      },
      { stripeAccount: config.stripeAccountId! },
    );

    logger.info("tap-to-pay-intent-created", {
      intentId: paymentIntent.id,
      tenantId: input.tenantId,
      amount: input.amountCents,
    });

    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret || "",
      amountCents: paymentIntent.amount,
      currency: paymentIntent.currency.toUpperCase(),
      description: input.description,
      status: "waiting",
    };
  } catch (err) {
    logger.error("tap-to-pay-intent-error", {
      error: (err as Error).message,
      tenantId: input.tenantId,
    });
    throw AppError.upstream(`Fout bij Tap to Pay: ${(err as Error).message}`);
  }
}

/**
 * Retrieve payment intent status. Client polls this to know when payment completes.
 */
export async function getTapToPayStatus(
  tenantId: string,
  paymentIntentId: string,
  stripeAccountId: string,
): Promise<{ status: TapToPaySession["status"]; amountCents: number }> {
  const stripe = getStripeClient();

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      stripeAccount: stripeAccountId,
    });

    const status: TapToPaySession["status"] =
      intent.status === "succeeded"
        ? "completed"
        : intent.status === "processing"
          ? "processing"
          : intent.status === "canceled"
            ? "cancelled"
            : ["requires_action", "requires_payment_method", "requires_confirmation"].includes(intent.status)
              ? "waiting"
              : "failed";

    return { status, amountCents: intent.amount };
  } catch (err) {
    logger.error("tap-to-pay-status-error", { error: (err as Error).message });
    throw AppError.upstream("Kon status niet ophalen.");
  }
}

/**
 * Enable Tap to Pay for a tenant (called when they complete Stripe Connect onboarding).
 */
export async function enableTapToPayForTenant(tenantId: string, stripeAccountId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { stripeConnectAccountId: stripeAccountId },
  });

  logger.info("tap-to-pay-enabled", { tenantId, stripeAccountId });
}
