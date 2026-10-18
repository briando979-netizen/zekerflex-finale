import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { refundOrder } from "@/lib/shop/admin-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/shop/orders/:id/refund — full Stripe refund, order cancelled, stock booked back.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
  const r = await refundOrder(id);
  await recordAudit({ category: "ADMIN", action: "shop.order_refunded", actorUserId: principal.userId, summary: `Bestelling ${id} terugbetaald (${(r.amountCents / 100).toFixed(2)} EUR, ${r.refundId})`, targetType: "shop-order", targetId: id });
  return NextResponse.json(r);
});
