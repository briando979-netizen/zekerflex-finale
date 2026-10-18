import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { getStripeClient } from "@/lib/billing/stripe";
import { SimplePdf } from "@/lib/pdf/simple";

// ---------------------------------------------------------------------------
// Webshop management tools for /admin/shop:
//   - discount codes: created as Stripe coupons + promotion codes, so the
//     existing Checkout (allow_promotion_codes) redeems them and Stripe
//     enforces expiry, max uses and minimum amount;
//   - refunds: full Stripe refund of a paid order, stock booked back;
//   - low-stock list, CSV export and a packing slip PDF.
// ---------------------------------------------------------------------------

interface OrderLine {
  productId?: string;
  variantId?: string;
  name: string;
  priceCents: number;
  qty: number;
  size?: string | null;
  color?: string | null;
}

export interface DiscountCodeInput {
  code: string;
  percentOff?: number | undefined;
  amountOffCents?: number | undefined;
  maxRedemptions?: number | undefined;
  expiresAt?: string | undefined;
  minimumCents?: number | undefined;
  firstTimeOnly?: boolean | undefined;
}

export async function listDiscountCodes() {
  const stripe = getStripeClient();
  const res = await stripe.promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon"] });
  return res.data.map((p) => {
    const coupon = (p as unknown as { promotion?: { coupon?: { percent_off: number | null; amount_off: number | null } | string } }).promotion?.coupon;
    const c = typeof coupon === "object" ? coupon : null;
    return {
      id: p.id,
      code: p.code,
      active: p.active,
      timesRedeemed: p.times_redeemed,
      maxRedemptions: p.max_redemptions,
      expiresAt: p.expires_at ? new Date(p.expires_at * 1000).toISOString() : null,
      minimumCents: p.restrictions?.minimum_amount ?? null,
      firstTimeOnly: p.restrictions?.first_time_transaction ?? false,
      percentOff: c?.percent_off ?? null,
      amountOffCents: c?.amount_off ?? null,
    };
  });
}

export async function createDiscountCode(input: DiscountCodeInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) throw AppError.validation("Code: 3–30 tekens — letters, cijfers of een streepje");
  if (!input.percentOff === !input.amountOffCents) throw AppError.validation("Kies óf een percentage óf een vast bedrag");
  const stripe = getStripeClient();
  const coupon = await stripe.coupons.create({
    name: `ZekerFlex-shop ${code}`,
    duration: "once",
    ...(input.percentOff ? { percent_off: input.percentOff } : { amount_off: input.amountOffCents!, currency: "eur" }),
  });
  const expires = input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : undefined;
  const promo = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code,
    ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
    ...(expires ? { expires_at: expires } : {}),
    ...(input.minimumCents || input.firstTimeOnly
      ? { restrictions: { ...(input.minimumCents ? { minimum_amount: input.minimumCents, minimum_amount_currency: "eur" } : {}), ...(input.firstTimeOnly ? { first_time_transaction: true } : {}) } }
      : {}),
  });
  return { id: promo.id, code: promo.code };
}

export async function setDiscountCodeActive(id: string, active: boolean) {
  await getStripeClient().promotionCodes.update(id, { active });
}

/** Full refund of a paid order via Stripe; the variants' stock is booked back. */
export async function refundOrder(orderId: string): Promise<{ refundId: string; amountCents: number }> {
  const order = await prisma.shopOrder.findUnique({ where: { id: orderId } });
  if (!order) throw AppError.notFound("Bestelling niet gevonden");
  if (!order.stripePaymentIntentId) throw AppError.precondition("Deze bestelling is niet (online) betaald");
  if (order.status === "CANCELLED") throw AppError.precondition("Deze bestelling is al geannuleerd");
  const refund = await getStripeClient().refunds.create({ payment_intent: order.stripePaymentIntentId, reason: "requested_by_customer", metadata: { shopOrderId: order.id } }, { idempotencyKey: `shop-refund:${order.id}` });
  await prisma.shopOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  for (const line of (order.itemsJson as unknown as OrderLine[]) ?? []) {
    if (line.variantId) await prisma.shopProductVariant.updateMany({ where: { id: line.variantId }, data: { stock: { increment: line.qty } } }).catch(() => undefined);
  }
  return { refundId: refund.id, amountCents: refund.amount };
}

export async function lowStock(threshold = 5) {
  return prisma.shopProductVariant.findMany({
    where: { stock: { lte: threshold }, product: { active: true } },
    select: { id: true, size: true, color: true, stock: true, sku: true, product: { select: { id: true, name: true } } },
    orderBy: { stock: "asc" },
    take: 100,
  });
}

const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export async function ordersCsv(from: Date, to: Date): Promise<string> {
  const orders = await prisma.shopOrder.findMany({ where: { createdAt: { gte: from, lt: to } }, orderBy: { createdAt: "asc" } });
  const head = "Bestelling;Datum;Status;Naam;E-mail;Adres;Postcode;Plaats;Artikelen;Subtotaal;Verzending;Totaal;Vervoerder;Track & trace";
  const rows = orders.map((o) =>
    [
      o.id,
      o.createdAt.toISOString().slice(0, 16).replace("T", " "),
      o.status,
      `${o.firstName} ${o.lastName}`,
      o.email,
      o.address,
      o.postalCode,
      o.city,
      ((o.itemsJson as unknown as OrderLine[]) ?? []).map((l) => `${l.qty}x ${l.name}${l.size ? ` ${l.size}` : ""}${l.color ? ` ${l.color}` : ""}`).join(" | "),
      eur(o.subtotalCents),
      eur(o.shippingCents),
      eur(o.totalCents),
      o.carrier ?? "",
      o.trackingNumber ?? "",
    ]
      .map(csv)
      .join(";"),
  );
  return `﻿${[head, ...rows].join("\r\n")}\r\n`;
}

export async function packingSlipPdf(orderId: string): Promise<{ bytes: Buffer; filename: string }> {
  const o = await prisma.shopOrder.findUnique({ where: { id: orderId } });
  if (!o) throw AppError.notFound("Bestelling niet gevonden");
  const pdf = new SimplePdf();
  pdf.heading("Pakbon — ZekerFlex Werk & PBM", 18);
  pdf.line(`Bestelling ${o.id}`, 11, { color: [0.05, 0.36, 0.29] });
  pdf.gap(6);
  pdf.rule();
  pdf.line("Verzenden naar", 10, { bold: true });
  pdf.line(`${o.firstName} ${o.lastName}`, 12, { bold: true });
  pdf.line(o.address, 11);
  pdf.line(`${o.postalCode}  ${o.city}`, 11);
  pdf.gap(8);
  pdf.rule();
  pdf.line("Inhoud", 10, { bold: true });
  for (const l of (o.itemsJson as unknown as OrderLine[]) ?? []) {
    pdf.row(`☐  ${l.qty}x ${l.name}${l.size ? ` — maat ${l.size}` : ""}${l.color ? `, ${l.color}` : ""}`, "");
  }
  pdf.gap(8);
  pdf.rule();
  pdf.row("Besteld op", o.createdAt.toLocaleDateString("nl-NL"));
  pdf.row("Aantal artikelen", String(((o.itemsJson as unknown as OrderLine[]) ?? []).reduce((s, l) => s + l.qty, 0)));
  pdf.gap(12);
  pdf.line("Vragen of retour? Mail shop@zekerflex.com met je bestelnummer.", 9, { color: [0.4, 0.45, 0.42] });
  return { bytes: pdf.toBuffer(), filename: `pakbon-${o.id}.pdf` };
}
