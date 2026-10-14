import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError, toErrorBody } from "@/lib/errors";
import { getPrincipal, requireRole } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { recordAudit } from "@/lib/audit";
import { createShopOrderCheckoutSession } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

const schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  address: z.string().trim().min(3).max(200),
  postalCode: z.string().trim().min(3).max(12),
  city: z.string().trim().min(1).max(80),
  items: z
    .array(z.object({ variantId: z.string().min(1), qty: z.number().int().positive().max(99) }))
    .min(1)
    .max(40),
});

const variantLabel = (size: string | null, color: string | null): string =>
  [size ? `Maat ${size}` : null, color].filter(Boolean).join(", ");

// POST /api/shop/orders — public checkout submit. Prices are never trusted
// from the client: every line is re-priced server-side against the live,
// active ShopProduct catalog before the order (and its total) is persisted.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "shop-order",
      identifier: clientIp(request),
      limit: 10,
      windowSeconds: 600,
      message: "Te veel bestellingen vanaf dit adres — probeer het later opnieuw.",
    });

    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Controleer je gegevens.", parsed.error.flatten());
    }
    const d = parsed.data;

    const variants = await prisma.shopProductVariant.findMany({
      where: { id: { in: d.items.map((i) => i.variantId) }, product: { active: true } },
      include: { product: { select: { id: true, name: true, priceCents: true, imageUrl: true } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    type Line = {
      variantId: string;
      productId: string;
      name: string;
      priceCents: number;
      qty: number;
      imageUrl: string | null;
      size: string | null;
      color: string | null;
    };
    const lines: Line[] = [];
    const outOfStock: string[] = [];
    for (const i of d.items) {
      const v = byId.get(i.variantId);
      if (!v) continue;
      const label = variantLabel(v.size, v.color);
      if (v.stock < i.qty) {
        outOfStock.push(label ? `${v.product.name} (${label})` : v.product.name);
        continue;
      }
      lines.push({
        variantId: v.id,
        productId: v.product.id,
        name: label ? `${v.product.name} — ${label}` : v.product.name,
        priceCents: v.priceCents ?? v.product.priceCents,
        qty: i.qty,
        imageUrl: v.product.imageUrl,
        size: v.size,
        color: v.color,
      });
    }

    if (outOfStock.length > 0) {
      throw AppError.validation(`Niet genoeg op voorraad: ${outOfStock.join(", ")}. Pas je winkelwagen aan.`);
    }
    if (lines.length === 0) {
      throw AppError.validation("Geen van deze producten is nog beschikbaar.");
    }

    const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
    const shippingCents = subtotalCents >= 5000 || subtotalCents === 0 ? 0 : 495;
    const totalCents = subtotalCents + shippingCents;

    const order = await prisma.shopOrder.create({
      data: {
        status: "PENDING_PAYMENT",
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        address: d.address,
        postalCode: d.postalCode,
        city: d.city,
        itemsJson: lines,
        subtotalCents,
        shippingCents,
        totalCents,
      },
    });

    await recordAudit({
      category: "ADMIN",
      action: "shop.order.created",
      actorLabel: "system",
      summary: `Shopbestelling ${order.id} aangemaakt, wacht op betaling (${money(totalCents)}, ${lines.length} regel(s))`,
      targetType: "shop-order",
      targetId: order.id,
      metadata: { email: d.email, totalCents, lines: lines.length },
    });

    // Confirmation mails go out from the Stripe webhook once payment is
    // actually confirmed (app/api/webhooks/stripe/route.ts) — never here,
    // since nothing has been paid yet at this point.
    const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
    let session;
    try {
      session = await createShopOrderCheckoutSession({
        orderId: order.id,
        email: d.email,
        lines: lines.map((l) => ({ name: l.name, priceCents: l.priceCents, qty: l.qty })),
        shippingCents,
        successUrl: `${baseUrl}/shop/bestelling/${order.id}?paid=1`,
        cancelUrl: `${baseUrl}/shop/bestelling/${order.id}?cancelled=1`,
      });
    } catch (err) {
      logger.error("shop order checkout session failed", { orderId: order.id, error: (err as Error).message });
      await prisma.shopOrder.update({ where: { id: order.id }, data: { status: "PAYMENT_FAILED" } });
      throw AppError.upstream("Kon geen betaalscherm starten — probeer het zo opnieuw.");
    }

    await prisma.shopOrder.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });

    logger.info("shop order pending payment", { id: order.id, totalCents, lines: lines.length });
    return NextResponse.json({ ok: true, id: order.id, totalCents, checkoutUrl: session.url });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("shop order failed", { error: (err as Error).message });
    return res;
  }
}

// GET /api/shop/orders — admin order overview.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await getPrincipal();
    if (!principal) throw AppError.unauthenticated();
    requireRole(principal, "PLATFORM_ADMIN");

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const orders = await prisma.shopOrder.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ orders });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
