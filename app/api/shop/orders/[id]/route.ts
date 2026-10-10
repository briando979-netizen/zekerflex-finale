import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["RECEIVED", "CONFIRMED", "SHIPPED", "CANCELLED"]),
});

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { status } = patchSchema.parse(await request.json());
  const order = await prisma.shopOrder.update({ where: { id: params.id }, data: { status } });
  await recordAudit({
    category: "ADMIN",
    action: "shop.order.status_changed",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Shopbestelling ${order.id} -> ${status}`,
    targetType: "shop-order",
    targetId: order.id,
  });
  return NextResponse.json({ order });
});
