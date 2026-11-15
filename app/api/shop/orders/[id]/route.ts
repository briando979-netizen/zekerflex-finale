import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { bonToken } from "@/lib/shop/bon-token";
import { jsonError } from "@/lib/http/errors";
import { wachtOpOverschrijving } from "@/lib/shop/overschrijving-kenmerk";
import { decrementVariantStock, notifyShopOrderPaid, type ShopOrderLine } from "@/lib/shop/bestelling-betaald";
import { meldVerkopersBetaald } from "@/lib/shop/verkoper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["PENDING_PAYMENT", "RECEIVED", "CONFIRMED", "SHIPPED", "CANCELLED", "PAYMENT_FAILED"]).optional(),
  carrier: z.string().trim().max(40).nullable().optional(),
  trackingNumber: z.string().trim().max(80).nullable().optional(),
});

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const d = patchSchema.parse(await request.json());
  const before = await prisma.shopOrder.findUnique({ where: { id: params.id }, select: { status: true, stripeSessionId: true } });
  // Een bestelling per overschrijving (lib/shop/overschrijving.ts) die op betaald gaat: atomair claimen, zodat een dubbele klik of twee
  // beheerders tegelijk de voorraad en de mails niet twee keer doen. Daarna verloopt het zoals na een betaling via Stripe.
  let overschrijvingBinnen = false;
  if (d.status === "RECEIVED" && before && wachtOpOverschrijving(before)) {
    const claim = await prisma.shopOrder.updateMany({
      where: { id: params.id, status: "PENDING_PAYMENT", stripeSessionId: null },
      data: { status: "RECEIVED" },
    });
    overschrijvingBinnen = claim.count > 0;
  }
  const order = await prisma.shopOrder.update({
    where: { id: params.id },
    data: {
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.carrier !== undefined ? { carrier: d.carrier } : {}),
      ...(d.trackingNumber !== undefined ? { trackingNumber: d.trackingNumber } : {}),
    },
  });
  await recordAudit({
    category: "ADMIN",
    action: "shop.order.status_changed",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Shopbestelling ${order.id} bijgewerkt${d.status ? ` -> ${d.status}` : ""}`,
    targetType: "shop-order",
    targetId: order.id,
  });

  if (overschrijvingBinnen) {
    await recordAudit({
      category: "ADMIN",
      action: "shop.order.paid",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Shopbestelling ${order.id} betaald per overschrijving (bevestigd in Beheer)`,
      targetType: "shop-order",
      targetId: order.id,
      metadata: { totalCents: order.totalCents, via: "overschrijving" },
    });
    await decrementVariantStock(order.id, (order.itemsJson as ShopOrderLine[] | null) ?? [], "user");
    await notifyShopOrderPaid(order);
    // producten van verkopers op de marktplaats: zij versturen zelf (lib/shop/verkoper.ts)
    await meldVerkopersBetaald(order);
  }

  // Just shipped with a tracking number on file — let the customer know
  // where to follow it live, rather than leaving them to guess.
  if (before?.status !== "SHIPPED" && order.status === "SHIPPED" && order.trackingNumber) {
    const trackUrl = `${env.APP_BASE_URL.replace(/\/+$/, "")}/shop/bestelling/${order.id}?t=${bonToken(order.id)}`;
    await sendMail({
      to: order.email,
      from: env.MAIL_FROM,
      kind: "shop-order-bevestiging",
      subject: "Je bestelling is onderweg",
      text: `Hoi ${order.firstName},\n\nJe bestelling is verzonden${order.carrier ? ` via ${order.carrier}` : ""}${order.trackingNumber ? ` (track & trace: ${order.trackingNumber})` : ""}.\n\nVolg 'm live: ${trackUrl}\n\nBinnen? Op dezelfde pagina kun je je aankoop beoordelen; daar help je andere kopers mee.\n\nBestelreferentie: ${order.id}`,
      html: mailShell(
        "Je bestelling is onderweg",
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${order.firstName}, je bestelling is verzonden${order.carrier ? ` via ${order.carrier}` : ""}.</p>
         <p style="margin:0 0 20px">${mailButton(trackUrl, "Volg je bestelling live")}</p>
         <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3C4A42">Binnen? Op dezelfde pagina kun je je aankoop beoordelen; daar help je andere kopers mee.</p>
         <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
      ),
    }).catch((e) => logger.warn("shop order shipped mail failed", { error: (e as Error).message }));
  }

  return NextResponse.json({ order });
});

// GET /api/shop/orders/:id — public, read-only order status for the live
// tracking page (app/shop/bestelling/[id]). No auth: /shop checkout is
// guest-only, so the unguessable cuid id is what scopes access — only the
// fields a customer needs to see are returned, never the full admin record.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
  // De volgpagina vraagt elke 8 s (ruim 70 per 10 min); dit houdt het raden van
  // bestelnummers tegen zonder een echte klant te hinderen.
  try {
    await enforceRateLimit({
      name: "shop-order-status",
      identifier: clientIp(req),
      limit: 240,
      windowSeconds: 600,
      message: "Te veel aanvragen vanaf dit adres, probeer het over enkele minuten opnieuw.",
    });
  } catch (error) {
    return jsonError(error);
  }
  const order = await prisma.shopOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      firstName: true,
      itemsJson: true,
      totalCents: true,
      carrier: true,
      trackingNumber: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!order) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bestelling niet gevonden" } }, { status: 404 });
  return NextResponse.json({ order });
}
