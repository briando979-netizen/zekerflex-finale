import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { constructWebhookEvent } from "@/lib/billing/stripe";
import { claimIdempotency } from "@/lib/redis";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe
 *
 * Public endpoint. Signature-verified with STRIPE_WEBHOOK_SECRET. Marks the
 * employer's invoice PAID once checkout actually settles — the redirect back
 * from Stripe (success_url) is only a UX hint and never flips the invoice
 * itself, since async methods (iDEAL, SEPA Direct Debit) confirm later.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const log = logger.forRequest(request, { route: "POST /api/webhooks/stripe" });
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("missing stripe-signature header");
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    log.warn("rejected stripe webhook (bad signature)", { error: (err as Error).message });
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    if (!(await claimIdempotency(`stripe:${event.id}`, 24 * 60 * 60))) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  } catch (err) {
    log.warn("webhook idempotency store unavailable", { error: (err as Error).message });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) {
      log.warn("stripe session without invoiceId metadata", { sessionId: session.id });
      return NextResponse.json({ ok: true, matched: false });
    }
    if (session.payment_status !== "paid") {
      return NextResponse.json({ ok: true, matched: false, paymentStatus: session.payment_status });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, number: true, status: true },
    });
    if (!invoice) {
      log.warn("stripe webhook: invoice not found", { invoiceId });
      return NextResponse.json({ ok: true, matched: false });
    }

    if (invoice.status !== InvoiceStatus.PAID) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          paidAt: new Date(),
          stripePaymentIntentId:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
        },
      });
      await recordAudit({
        category: "BILLING",
        action: "invoice.paid",
        actorLabel: "integration:stripe",
        summary: `Factuur ${invoice.number} betaald via Stripe`,
        targetType: "invoice",
        targetId: invoice.id,
        metadata: { sessionId: session.id, eventType: event.type },
      });
    }
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const updated = await prisma.freelancerProfile.updateMany({
      where: { stripeConnectedAccountId: account.id, stripePayoutsEnabled: { not: payoutsEnabled } },
      data: { stripePayoutsEnabled: payoutsEnabled },
    });
    if (updated.count > 0) {
      log.info("stripe connect account status changed", { accountId: account.id, payoutsEnabled });
    }
  }

  return NextResponse.json({ ok: true });
}
