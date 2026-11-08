/**
 * Payment Processing Subsystem
 * Handles Stripe integration: charges, refunds, disputes, webhooks
 */

import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/billing/stripe";
import { AppError } from "@/lib/errors";
import { PaymentStatus, PaymentMethod } from "@prisma/client";
import Stripe from "stripe";

export interface PaymentProcessingInput {
  invoiceId: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  creditorIban: string;
  debtorIban?: string;
  idempotencyKey: string;
}

/** Create a payment record and submit via appropriate channel */
export async function processPayment(
  input: PaymentProcessingInput,
): Promise<string> {
  if (input.amountCents <= 0) {
    throw AppError.validation("Betalingsbedrag moet positief zijn.");
  }

  // Check if payment already exists (idempotency)
  const existing = await prisma.payment.findUnique({
    where: { endToEndId: input.idempotencyKey },
  });

  if (existing) {
    return existing.id;
  }

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      invoiceId: input.invoiceId,
      method: input.method,
      amountCents: input.amountCents,
      currency: input.currency,
      creditorIban: input.creditorIban,
      debtorIban: input.debtorIban,
      endToEndId: input.idempotencyKey,
      status: "PENDING",
    },
  });

  // Submit payment based on method
  try {
    if (input.method === "SEPA_INSTANT") {
      await submitSEPAInstantPayment(payment.id, input);
    } else if (input.method === "SEPA_STANDARD") {
      await submitSEPAStandardPayment(payment.id, input);
    }
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureCode: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      },
    });
    throw error;
  }

  return payment.id;
}

/** Submit payment via SEPA Instant Credit Transfer */
async function submitSEPAInstantPayment(
  paymentId: string,
  input: PaymentProcessingInput,
): Promise<void> {
  if (!input.debtorIban) {
    throw AppError.validation(
      "SEPA Instant vereist een debiteur IBAN (debtor IBAN).",
    );
  }

  // In production, integrate with SEPA provider (e.g., Wise, Stripe Payout, own bank)
  // For now, mark as submitted pending external confirmation
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });
}

/** Submit payment via SEPA Standard Credit Transfer */
async function submitSEPAStandardPayment(
  paymentId: string,
  input: PaymentProcessingInput,
): Promise<void> {
  if (!input.debtorIban) {
    throw AppError.validation(
      "SEPA Standard vereist een debiteur IBAN (debtor IBAN).",
    );
  }

  // Batch into daily SEPA files; actual submission happens in cron job
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });
}

/** Retrieve payment status from provider */
export async function getPaymentStatus(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: true },
  });
}

/** Handle Stripe refund for an invoice payment */
export async function refundPayment(
  paymentId: string,
  reason: string,
): Promise<string> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: true },
  });

  if (!payment) {
    throw AppError.notFound("Betaling niet gevonden.");
  }

  if (!payment.invoice.stripePaymentIntentId) {
    throw AppError.validation(
      "Alleen Stripe-betalingen kunnen via deze weg terugbetaald worden.",
    );
  }

  const stripe = getStripeClient();

  // Refund via Stripe
  const refund = await stripe.refunds.create({
    payment_intent: payment.invoice.stripePaymentIntentId,
    metadata: { reason, originalPaymentId: paymentId },
  });

  if (refund.status !== "succeeded") {
    throw AppError.upstream(
      `Terugbetaling mislukt: ${refund.failure_reason || "onbekende reden"}`,
    );
  }

  return refund.id;
}

/** Handle dispute webhook from Stripe */
export async function handleStripeDispute(
  dispute: Stripe.Dispute,
): Promise<void> {
  if (!dispute.payment_intent || typeof dispute.payment_intent === "string") {
    throw AppError.validation("Dispute mist payment intent referentie.");
  }

  const paymentIntent = dispute.payment_intent;
  const invoiceId = paymentIntent.metadata?.invoiceId;

  if (!invoiceId) {
    throw AppError.validation("Kan niet bepalen welke factuur in geschil is.");
  }

  // Find the payment for this invoice
  const payment = await prisma.payment.findUnique({
    where: { invoiceId },
  });

  if (!payment) {
    console.warn(`Dispute for unknown payment: invoiceId=${invoiceId}`);
    return;
  }

  // Update payment status based on dispute status
  const statusMap: Record<Stripe.Dispute.Status, PaymentStatus> = {
    warning_under_review: "PENDING",
    warning_closed: "SETTLED",
    charge_disputed: "PENDING",
    charge_won: "SETTLED",
    charge_lost: "FAILED",
    charge_refunded: "FAILED",
  };

  const newStatus = statusMap[dispute.status] ?? "PENDING";

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: newStatus,
      failureCode:
        newStatus === "FAILED" ? `dispute_${dispute.reason}` : undefined,
    },
  });
}

/** Mark payment as settled after external confirmation */
export async function settlePayment(
  paymentId: string,
  providerReference: string,
): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw AppError.notFound("Betaling niet gevonden.");
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "SETTLED",
      settledAt: new Date(),
      providerRef: providerReference,
    },
  });

  // Mark associated invoice as paid
  await prisma.invoice.update({
    where: { id: payment.invoiceId },
    data: {
      status: "PAID",
      paidAt: new Date(),
    },
  });
}

/** Mark payment as failed with reason */
export async function failPayment(
  paymentId: string,
  failureCode: string,
  failureReason?: string,
): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw AppError.notFound("Betaling niet gevonden.");
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "FAILED",
      failureCode,
    },
  });
}

/** Retry failed payment */
export async function retryPayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.status !== "FAILED") {
    throw AppError.validation(
      "Alleen mislukte betalingen kunnen opnieuw geprobeerd worden.",
    );
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "PENDING",
      failureCode: null,
    },
  });
}

/** Get pending payments awaiting settlement */
export async function getPendingPayments(options?: { tenantId?: string }) {
  return prisma.payment.findMany({
    where: {
      status: "SUBMITTED",
      ...(options?.tenantId && {
        invoice: { recipientTenantId: options.tenantId },
      }),
    },
    include: { invoice: true },
    orderBy: { submittedAt: "asc" },
  });
}
