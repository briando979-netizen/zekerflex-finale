import { handleStripeIdentityEvent } from "@/lib/kyc/stripe-identity";
import { alertOwnerLater } from "@/lib/ops/alert";
import { NextResponse, after, type NextRequest } from "next/server";
import Stripe from "stripe";
import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { constructWebhookEvent } from "@/lib/billing/stripe";
import { claimIdempotency } from "@/lib/redis";
import { book } from "@/lib/bank/ledger";
import { decideAuthorization, releaseHold, settleTransaction, syncCard } from "@/lib/bank/cards";
import { markRequestPaidExternally } from "@/lib/bank/p2p";
import { payOnClientPayment } from "@/lib/payouts/execute";
import { checkLowBalance, notifyBank, notifyIncoming } from "@/lib/bank/notify";
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
  variantId?: string;
  size?: string | null;
  color?: string | null;
}

/** Marks one invoice PAID (idempotent) and fulfils a cancellation-penalty
 * claim if applicable. Returns false if the invoice id doesn't resolve, so
 * callers can tell a real match from a stale/unknown id. */
async function markInvoicePaid(invoiceId: string, session: Stripe.Checkout.Session, eventType: string): Promise<boolean> {
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
    logger.warn("stripe webhook: invoice not found", { invoiceId });
    return false;
  }

  if (invoice.status !== InvoiceStatus.PAID) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      },
    });
    // The client paid the freelancer's (self-billed) invoice: a freelancer
    // who chose "wait for the client" is paid in full now.
    if (invoice.type === InvoiceType.SELF_BILL_FREELANCER) {
      await payOnClientPayment(invoice.id).catch((err) => logger.error("payout on client payment failed", { invoiceId: invoice.id, error: (err as Error).message }));
    }
    await recordAudit({
      category: "BILLING",
      action: "invoice.paid",
      actorLabel: "integration:stripe",
      summary: `Factuur ${invoice.number} betaald via Stripe`,
      targetType: "invoice",
      targetId: invoice.id,
      metadata: { sessionId: session.id, eventType },
    });

    if (invoice.type === InvoiceType.CANCELLATION_PENALTY && invoice.claimId) {
      await fulfillPaidClaim(invoice);
    }
  }
  return true;
}

/** Decrements variant stock for a just-paid order. Best-effort per line: if a
 * variant was oversold in the window between checkout and payment (rare race),
 * the order still gets marked paid — the customer already paid — but the
 * shortfall is recorded so admin can follow up. */
async function decrementVariantStock(orderId: string, lines: ShopOrderLine[]): Promise<void> {
  const shortfalls: string[] = [];
  for (const line of lines) {
    if (!line.variantId) continue;
    const res = await prisma.shopProductVariant.updateMany({
      where: { id: line.variantId, stock: { gte: line.qty } },
      data: { stock: { decrement: line.qty } },
    });
    if (res.count === 0) shortfalls.push(`${line.name} x${line.qty}`);
  }
  if (shortfalls.length > 0) {
    logger.warn("shop order oversold", { orderId, shortfalls });
    await recordAudit({
      category: "ADMIN",
      action: "shop.order.oversold",
      actorLabel: "integration:stripe",
      summary: `Shopbestelling ${orderId} betaald maar niet genoeg voorraad voor: ${shortfalls.join(", ")}`,
      targetType: "shop-order",
      targetId: orderId,
      metadata: { shortfalls },
    });
  }
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

const DECLINE_TEXT: Record<string, string> = {
  insufficient_funds: "onvoldoende saldo",
  budget_exceeded: "maandbudget van de pas bereikt",
  account_frozen: "rekening geblokkeerd",
  card_inactive: "pas is bevroren",
  online_blocked: "online betalen staat uit voor deze pas",
  abroad_blocked: "betalen in het buitenland staat uit",
  gambling_blocked: "gokken is geblokkeerd op deze pas",
  over_payment_limit: "boven je limiet per betaling",
};

async function notifyCardDecision(auth: Stripe.Issuing.Authorization, decision: { approved: boolean; reason: string }): Promise<void> {
  const card = await prisma.bankCard.findUnique({ where: { stripeCardId: auth.card.id }, select: { accountId: true, last4: true } });
  if (!card) return;
  const amount = ((auth.pending_request?.amount ?? 0) / 100).toFixed(2).replace(".", ",");
  const merchant = auth.merchant_data?.name ?? "een winkel";
  if (decision.approved) {
    if ((auth.pending_request?.amount ?? 0) <= 0) return;
    await notifyBank(card.accountId, "card", `€ ${amount} betaald`, `Bij ${merchant} met pas …${card.last4}.`);
    await checkLowBalance(card.accountId);
  } else if (DECLINE_TEXT[decision.reason]) {
    await notifyBank(card.accountId, "card", "Pasbetaling geweigerd", `€ ${amount} bij ${merchant}: ${DECLINE_TEXT[decision.reason]}.`);
  }
}

/**
 * POST /api/webhooks/stripe
 *
 * Public endpoint. Signature-verified with STRIPE_WEBHOOK_SECRET. Marks the
 * employer's invoice PAID once checkout actually settles — the redirect back
 * from Stripe (success_url) is only a UX hint and never flips the invoice
 * itself, since async methods (iDEAL, SEPA Direct Debit) confirm later.
 */
// Safety net: an unexpected error answers 500 (Stripe retries the event) AND
// tells the owner — previously such failures were silent.
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleStripeWebhook(request);
  } catch (err) {
    logger.error("stripe webhook failed", { error: (err as Error).message });
    alertOwnerLater({ key: "stripe-webhook", title: "Fout bij verwerken van een Stripe-betaling", detail: `Een Stripe-gebeurtenis kon niet verwerkt worden: ${(err as Error).message.slice(0, 160)}. Stripe probeert het automatisch opnieuw; controleer betalingen en de serverlogs.`, url: "/admin/stripe" });
    return NextResponse.json({ error: "webhook processing failed" }, { status: 500 });
  }
}

async function handleStripeWebhook(request: NextRequest): Promise<NextResponse> {
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

  // ID verification via Stripe Identity (lib/kyc/stripe-identity.ts).
  if (event.type.startsWith("identity.verification_session.")) {
    await handleStripeIdentityEvent(event);
    return NextResponse.json({ ok: true });
  }

  // ZekerFlex Bank cards: every card payment is approved/declined against the
  // ledger. Stripe reads the decision from this response body (it must carry
  // the Stripe-Version header) and declines on timeout.
  if (event.type === "issuing_authorization.request") {
    const auth = event.data.object as Stripe.Issuing.Authorization;
    let decision = { approved: false, reason: "error" };
    try {
      decision = await decideAuthorization(auth);
    } catch (err) {
      log.error("issuing authorization decision failed", { authorization: auth.id, error: (err as Error).message });
    }
    log.info("issuing authorization", { authorization: auth.id, ...decision });
    // Tell the cardholder after answering Stripe (the decision has a ~2s budget).
    after(() => notifyCardDecision(auth, decision));
    return NextResponse.json({ approved: decision.approved }, { headers: { "Stripe-Version": event.api_version ?? "" } });
  }
  if (event.type === "issuing_authorization.updated") {
    await releaseHold(event.data.object as Stripe.Issuing.Authorization);
    return NextResponse.json({ ok: true });
  }
  if (event.type === "issuing_transaction.created") {
    await settleTransaction(event.data.object as Stripe.Issuing.Transaction);
    return NextResponse.json({ ok: true });
  }
  if (event.type === "issuing_card.updated") {
    await syncCard(event.data.object as Stripe.Issuing.Card);
    return NextResponse.json({ ok: true });
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

    const bankAccountId = session.metadata?.bankAccountId;
    if (bankAccountId) {
      if (session.payment_status !== "paid" || !session.amount_total) {
        return NextResponse.json({ ok: true, matched: false, paymentStatus: session.payment_status });
      }
      const requestId = session.metadata?.bankRequestId;
      const payer = session.customer_details?.name ?? session.customer_details?.email ?? null;
      const entry = await book(bankAccountId, {
        amountCents: session.amount_total,
        kind: requestId ? "TRANSFER" : "TOPUP",
        description: requestId ? `Betaalverzoek betaald via iDEAL${payer ? ` door ${payer}` : ""}` : "Opwaardering via iDEAL/kaart",
        counterparty: payer,
        reference: requestId ?? (typeof session.payment_intent === "string" ? session.payment_intent : session.id),
        idempotencyKey: `${requestId ? "request-ideal" : "topup"}:${session.id}`,
      });
      if (requestId) await markRequestPaidExternally(requestId, payer ?? "iDEAL");
      if (entry.created) after(() => notifyIncoming(bankAccountId, session.amount_total!, requestId ? `${payer ?? "iDEAL"} (betaalverzoek)` : "je opwaardering"));
      if (entry.created) {
        await recordAudit({
          category: "BILLING",
          action: "bank.topup",
          actorLabel: "integration:stripe",
          summary: `ZekerFlex Bank opgewaardeerd met ${(session.amount_total / 100).toFixed(2)} EUR`,
          targetType: "bank-account",
          targetId: bankAccountId,
          metadata: { sessionId: session.id, eventType: event.type },
        });
      }
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
        await decrementVariantStock(updated.id, (updated.itemsJson as ShopOrderLine[] | null) ?? []);
        await notifyShopOrderPaid(updated);
      }
      return NextResponse.json({ ok: true });
    }

    // Eén Checkout Session kan meerdere facturen tegelijk afrekenen (bulk
    // "Direct betalen" vanaf /werkgever/facturen) — metadata draagt dan
    // invoiceIds (JSON-array) in plaats van één invoiceId.
    const invoiceIdsRaw = session.metadata?.invoiceIds;
    if (invoiceIdsRaw) {
      if (session.payment_status !== "paid") {
        return NextResponse.json({ ok: true, matched: false, paymentStatus: session.payment_status });
      }
      let ids: string[] = [];
      try {
        ids = JSON.parse(invoiceIdsRaw);
      } catch {
        log.warn("stripe webhook: invoiceIds metadata is not valid JSON", { sessionId: session.id });
      }
      let matched = false;
      for (const id of ids) {
        if (await markInvoicePaid(id, session, event.type)) matched = true;
      }
      return NextResponse.json({ ok: true, matched });
    }

    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) {
      log.warn("stripe session without invoiceId metadata", { sessionId: session.id });
      return NextResponse.json({ ok: true, matched: false });
    }
    if (session.payment_status !== "paid") {
      return NextResponse.json({ ok: true, matched: false, paymentStatus: session.payment_status });
    }

    const matched = await markInvoicePaid(invoiceId, session, event.type);
    return NextResponse.json({ ok: true, matched });
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
