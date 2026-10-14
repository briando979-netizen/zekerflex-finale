import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["PENDING_PAYMENT", "RECEIVED", "CONFIRMED", "SHIPPED", "CANCELLED", "PAYMENT_FAILED"]).optional(),
  carrier: z.string().trim().max(40).nullable().optional(),
  trackingNumber: z.string().trim().max(80).nullable().optional(),
});

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const d = patchSchema.parse(await request.json());
  const before = await prisma.shopOrder.findUnique({ where: { id: params.id }, select: { status: true } });
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

  // Just shipped with a tracking number on file — let the customer know
  // where to follow it live, rather than leaving them to guess.
  if (before?.status !== "SHIPPED" && order.status === "SHIPPED" && order.trackingNumber) {
    const trackUrl = `${env.APP_BASE_URL.replace(/\/+$/, "")}/shop/bestelling/${order.id}`;
    await sendMail({
      to: order.email,
      from: env.MAIL_FROM,
      kind: "shop-order-bevestiging",
      subject: "Je bestelling is onderweg",
      text: `Hoi ${order.firstName},\n\nJe bestelling is verzonden${order.carrier ? ` via ${order.carrier}` : ""}${order.trackingNumber ? ` (track & trace: ${order.trackingNumber})` : ""}.\n\nVolg 'm live: ${trackUrl}\n\nBestelreferentie: ${order.id}`,
      html: mailShell(
        "Je bestelling is onderweg",
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${order.firstName}, je bestelling is verzonden${order.carrier ? ` via ${order.carrier}` : ""}.</p>
         <p style="margin:0 0 20px">${mailButton(trackUrl, "Volg je bestelling live")}</p>
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
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params;
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
