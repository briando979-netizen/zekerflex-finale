import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  size: z.string().trim().max(20).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  priceCents: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  stock: z.number().int().nonnegative().max(1_000_000).optional(),
});

async function ownedVariant(productId: string, variantId: string) {
  const variant = await prisma.shopProductVariant.findFirst({ where: { id: variantId, productId } });
  if (!variant) throw AppError.notFound("Variant niet gevonden");
  return variant;
}

export const PATCH = withAdminAccess<{ id: string; variantId: string }>(
  ["PLATFORM_ADMIN"],
  async (request, { params, principal }) => {
    await ownedVariant(params.id, params.variantId);
    const d = patchSchema.parse(await request.json());
    const variant = await prisma.shopProductVariant.update({
      where: { id: params.variantId },
      data: {
        ...(d.size !== undefined ? { size: d.size } : {}),
        ...(d.color !== undefined ? { color: d.color } : {}),
        ...(d.priceCents !== undefined ? { priceCents: d.priceCents } : {}),
        ...(d.stock !== undefined ? { stock: d.stock } : {}),
      },
    });
    await recordAudit({
      category: "ADMIN",
      action: "shop.variant.updated",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Variant ${variant.sku} bijgewerkt`,
      targetType: "shop-product-variant",
      targetId: variant.id,
    });
    return NextResponse.json({ variant });
  },
);

export const DELETE = withAdminAccess<{ id: string; variantId: string }>(
  ["PLATFORM_ADMIN"],
  async (_request, { params, principal }) => {
    const variant = await ownedVariant(params.id, params.variantId);
    await prisma.shopProductVariant.delete({ where: { id: params.variantId } });
    await recordAudit({
      category: "ADMIN",
      action: "shop.variant.deleted",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Variant ${variant.sku} verwijderd`,
      targetType: "shop-product-variant",
      targetId: variant.id,
    });
    return NextResponse.json({ ok: true });
  },
);
