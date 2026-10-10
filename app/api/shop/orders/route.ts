import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError, toErrorBody } from "@/lib/errors";
import { getPrincipal, requireRole } from "@/lib/auth";
import { sendMail, mailShell } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { recordAudit } from "@/lib/audit";

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
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().positive().max(99) }))
    .min(1)
    .max(40),
});

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

    const products = await prisma.shopProduct.findMany({
      where: { id: { in: d.items.map((i) => i.productId) }, active: true },
      select: { id: true, name: true, priceCents: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines = d.items
      .map((i) => {
        const p = byId.get(i.productId);
        return p ? { productId: p.id, name: p.name, priceCents: p.priceCents, qty: i.qty } : null;
      })
      .filter((l): l is { productId: string; name: string; priceCents: number; qty: number } => l !== null);

    if (lines.length === 0) {
      throw AppError.validation("Geen van deze producten is nog beschikbaar.");
    }

    const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
    const shippingCents = subtotalCents >= 5000 || subtotalCents === 0 ? 0 : 495;
    const totalCents = subtotalCents + shippingCents;

    const order = await prisma.shopOrder.create({
      data: {
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
      summary: `Shopbestelling ${order.id} ontvangen (${money(totalCents)}, ${lines.length} regel(s))`,
      targetType: "shop-order",
      targetId: order.id,
      metadata: { email: d.email, totalCents, lines: lines.length },
    });

    const lineRows = lines
      .map((l) => `${l.qty}x ${l.name} — ${money(l.priceCents * l.qty)}`)
      .join("\n");
    const lineRowsHtml = lines
      .map((l) => `<tr><td style="padding:4px 0">${l.qty}x ${l.name.replace(/</g, "&lt;")}</td><td style="padding:4px 0;text-align:right">${money(l.priceCents * l.qty)}</td></tr>`)
      .join("");

    await sendMail({
      to: env.MAIL_ADMIN,
      replyTo: d.email,
      kind: "shop-order",
      subject: `Nieuwe shopbestelling — ${order.id}`,
      text: `Nieuwe bestelling via de ZekerFlex-shop\n\n${d.firstName} ${d.lastName}\n${d.email}\n${d.address}, ${d.postalCode} ${d.city}\n\n${lineRows}\n\nSubtotaal: ${money(subtotalCents)}\nVerzending: ${shippingCents === 0 ? "Gratis" : money(shippingCents)}\nTotaal: ${money(totalCents)}\n\nBestelreferentie: ${order.id}`,
      html: mailShell(
        "Nieuwe shopbestelling",
        `<p style="margin:0 0 4px"><strong>${d.firstName} ${d.lastName}</strong></p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${d.email}<br/>${d.address}, ${d.postalCode} ${d.city}</p>
         <table style="width:100%;font-size:14px;color:#3C4A42">${lineRowsHtml}</table>
         <p style="margin:10px 0 0;font-size:14px;color:#3C4A42">Totaal: <strong>${money(totalCents)}</strong></p>
         <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
      ),
    }).catch((e) => logger.warn("shop order notify failed", { error: (e as Error).message }));

    await sendMail({
      to: d.email,
      from: env.MAIL_FROM,
      kind: "shop-order-bevestiging",
      subject: "Je bestelling bij de ZekerFlex-shop",
      text: `Hoi ${d.firstName},\n\nBedankt voor je bestelling. We hebben 'm ontvangen en gaan 'm inpakken.\n\n${lineRows}\n\nTotaal: ${money(totalCents)}\n\nBestelreferentie: ${order.id}`,
      html: mailShell(
        "Bestelling ontvangen",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${d.firstName}, bedankt voor je bestelling. We hebben 'm ontvangen en gaan 'm inpakken.</p>
         <table style="width:100%;font-size:14px;color:#3C4A42">${lineRowsHtml}</table>
         <p style="margin:10px 0 0;font-size:14px;color:#3C4A42">Totaal: <strong>${money(totalCents)}</strong></p>
         <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
      ),
    }).catch((e) => logger.warn("shop order confirmation failed", { error: (e as Error).message }));

    logger.info("shop order received", { id: order.id, totalCents, lines: lines.length });
    return NextResponse.json({ ok: true, id: order.id, totalCents });
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
