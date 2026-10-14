import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { constructWebhookEvent } from "@/lib/billing/stripe";
import { claimIdempotency } from "@/lib/redis";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell } from "@/lib/mail";
import { fulfillPaidClaim } from "@/lib/claims/fulfillment";
import { activateApiSubscription, syncApiSubscription } from "@/lib/billing/api-subscription-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

interface ShopOrderLine {
  name: string;
  priceCents: number;
  qty: number;
  imageUrl?: string | null;
}

/** Sends the admin notification + customer confirmation for a just-paid shop order (product photos + a link to the PDF receipt). Best-effort — never throws. */
async function notifyShopOrderPaid(order: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  itemsJson: unknown;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}): Promise<void> {
  const lines = (order.itemsJson as ShopOrderLine[] | null) ?? [];
  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
  const absImg = (u: string | null | undefined) => (u ? (u.startsWith("http") ? u : `${baseUrl}${u}`) : null);
  const pdfUrl = `${baseUrl}/api/shop/orders/${order.id}/pdf`;

  const lineRows = lines.map((l) => `${l.qty}x ${l.name} — ${money(l.priceCents * l.qty)}`).join("\n");
  const lineRowsHtml = lines
    .map((l) => {
      const img = absImg(l.imageUrl);
      return `<tr>
        <td style="padding:6px 8px 6px 0;width:48px">${img ? `<img src="${img}" alt="" width="40" height="40" style="border-radius:8px;object-fit:cover;display:block">` : ""}</td>
        <td style="padding:6px 0">${l.qty}x ${l.name.replace(/</g, "&lt;")}</td>
        <td style="padding:6px 0;text-align:right">${money(l.priceCents * l.qty)}</td>
      </tr>`;
    })
    .join("");

  await sendMail({
    to: env.MAIL_ADMIN,
    replyTo: order.email,
    kind: "shop-order",
    subject: `Betaalde shopbestelling — ${order.id}`,
    text: `Betaalde bestelling via de ZekerFlex-shop\n\n${order.firstName} ${order.lastName}\n${order.email}\n${order.address}, ${order.postalCode} ${order.city}\n\n${lineRows}\n\nSubtotaal: ${money(order.subtotalCents)}\nVerzending: ${order.shippingCents === 0 ? "Gratis" : money(order.shippingCents)}\nTotaal: ${money(order.totalCents)}\n\nBestelreferentie: ${order.id}`,
    html: mailShell(
      "Betaalde shopbestelling",
      `<p style="margin:0 0 4px"><strong>${order.firstName} ${order.lastName}</strong></p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${order.email}<br/>${order.address}, ${order.postalCode} ${order.city}</p>
       <table style="width:100%;font-size:14px;color:#3C4A42">${lineRowsHtml}</table>
       <p style="margin:10px 0 0;font-size:14px;color:#3C4A42">Totaal: <strong>${money(order.totalCents)}</strong></p>
       <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
    ),
  }).catch((e) => logger.warn("shop order notify failed", { error: (e as Error).message }));

  await sendMail({
    to: order.email,
    from: env.MAIL_FROM,
    kind: "shop-order-bevestiging",
    subject: "Je betaling is gelukt — bestelling bij de ZekerFlex-shop",
    text: `Hoi ${order.firstName},\n\nBedankt voor je bestelling, je betaling is gelukt. We gaan 'm inpakken.\n\n${lineRows}\n\nTotaal: ${money(order.totalCents)}\n\nBestelreferentie: ${order.id}\nFactuur (PDF): ${pdfUrl}`,
    html: mailShell(
      "Betaling gelukt",
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${order.firstName}, bedankt voor je bestelling — je betaling is gelukt. We gaan 'm inpakken.</p>
       <table style="width:100%;font-size:14px;color:#3C4A42">${lineRowsHtml}</table>
       <p style="margin:10px 0 0;font-size:14px;color:#3C4A42">Totaal: <strong>${money(order.totalCents)}</strong></p>
       <p style="margin:14px 0 0"><a href="${pdfUrl}" style="font-size:13px;color:#0E5C4A;font-weight:600">Download je factuur (PDF)</a></p>
       <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
    ),
  }).catch((e) => logger.warn("shop order confirmation failed", { error: (e as Error).message }));
}

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

    if (session.mode === "subscription") {
      await activateApiSubscription(session);
      return NextResponse.json({ ok: true });
    }

    const shopOrderId = session.metadata?.shopOrderId;
    if (shopOrderId) {
      if (session.payment_status !== "paid") {
        return NextResponse.json({ ok: true, matched: false, paymentStatus: session.payment_status });
      }
      const order = await prisma.shopOrder.findUnique({ where: { id: shopOrderId } });
      if (!order) {
        log.warn("stripe webhook: shop order not found", { shopOrderId });
        return NextResponse.json({ ok: true, matched: false });
      }
      if (order.status !== "RECEIVED") {
        const updated = await prisma.shopOrder.update({
          where: { id: order.id },
          data: {
            status: "RECEIVED",
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          },
        });
        await recordAudit({
          category: "ADMIN",
          action: "shop.order.paid",
          actorLabel: "integration:stripe",
          summary: `Shopbestelling ${updated.id} betaald via Stripe`,
          targetType: "shop-order",
          targetId: updated.id,
          metadata: { sessionId: session.id, eventType: event.type, totalCents: updated.totalCents },
        });
        await notifyShopOrderPaid(updated);
      }
      return NextResponse.json({ ok: true });
    }

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
      select: {
        id: true,
        number: true,
        status: true,
        type: true,
        claimId: true,
        totalCents: true,
        currency: true,
        recipientFreelancerId: true,
      },
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

      if (invoice.type === InvoiceType.CANCELLATION_PENALTY && invoice.claimId) {
        await fulfillPaidClaim(invoice);
      }
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const shopOrderId = session.metadata?.shopOrderId;
    if (shopOrderId) {
      await prisma.shopOrder.updateMany({
        where: { id: shopOrderId, status: "PENDING_PAYMENT" },
        data: { status: "PAYMENT_FAILED" },
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

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    await syncApiSubscription(event.data.object as Stripe.Subscription, event.type);
  }

  return NextResponse.json({ ok: true });
}
