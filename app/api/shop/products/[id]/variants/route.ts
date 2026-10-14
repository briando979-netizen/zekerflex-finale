import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const variantSchema = z.object({
  size: z.string().trim().max(20).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  priceCents: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  stock: z.number().int().nonnegative().max(1_000_000).default(0),
  sku: z.string().trim().max(60).optional(),
});

// POST /api/shop/products/:id/variants — add a size/color variant row.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const parsed = variantSchema.parse(await request.json());
  const product = await prisma.shopProduct.findUnique({ where: { id: params.id }, select: { id: true, name: true, slug: true } });
  if (!product) throw AppError.notFound("Product niet gevonden");

  const sku = parsed.sku || `${product.slug}-${randomUUID().slice(0, 8)}`;
  const variant = await prisma.shopProductVariant.create({
    data: {
      productId: product.id,
      size: parsed.size ?? null,
      color: parsed.color ?? null,
      priceCents: parsed.priceCents ?? null,
      stock: parsed.stock,
      sku,
    },
  });

  await recordAudit({
    category: "ADMIN",
    action: "shop.variant.created",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Variant toegevoegd aan "${product.name}": ${[parsed.size, parsed.color].filter(Boolean).join(" / ") || sku}`,
    targetType: "shop-product-variant",
    targetId: variant.id,
  });

  return NextResponse.json({ variant }, { status: 201 });
});
