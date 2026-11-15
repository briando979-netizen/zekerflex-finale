import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { BEOORDELING_STATUSSEN } from "@/lib/shop/beoordeling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.enum(BEOORDELING_STATUSSEN) });

const VELDEN = {
  id: true,
  orderId: true,
  naam: true,
  sterren: true,
  tekst: true,
  status: true,
  createdAt: true,
  product: { select: { id: true, name: true, slug: true } },
} as const;

// PATCH /api/admin/shop/beoordelingen/:id — de beheerder plaatst een beoordeling op de site of wijst hem af (lib/shop/beoordeling.ts).
export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const d = patchSchema.parse(await request.json());
  const r = await prisma.shopReview.update({ where: { id: params.id }, data: { status: d.status }, select: VELDEN });
  await recordAudit({
    category: "ADMIN",
    action: "shop.review.status_changed",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Beoordeling van ${r.product.name} -> ${d.status}`,
    targetType: "shop-review",
    targetId: r.id,
  });
  return NextResponse.json({ beoordeling: r });
});

// DELETE /api/admin/shop/beoordelingen/:id — helemaal weg (bijv. op verzoek van de koper).
export const DELETE = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params, principal }) => {
  await prisma.shopReview.delete({ where: { id: params.id } });
  await recordAudit({
    category: "ADMIN",
    action: "shop.review.deleted",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Beoordeling verwijderd",
    targetType: "shop-review",
    targetId: params.id,
  });
  return NextResponse.json({ ok: true });
});
