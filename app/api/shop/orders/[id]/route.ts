import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { stuurVerzondenMail } from "@/lib/shop/verzonden-mail";
import { cjNaBetaling } from "@/lib/shop/cj/bestelling";
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
    // producten van CJ: naar de leverancier, als de eigenaar dat aanzette (lib/shop/cj/bestelling.ts)
    after(() => cjNaBetaling(order.id));
  }

  // Just shipped with a tracking number on file — let the customer know
  // where to follow it live, rather than leaving them to guess.
  if (before?.status !== "SHIPPED" && order.status === "SHIPPED" && order.trackingNumber) {
    await stuurVerzondenMail(order);
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
