import { NextResponse } from "next/server";
import { z } from "zod";
import { lijst } from "@/lib/http/zod-lijst";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { shopImageRef } from "@/lib/shop/schema";
import { MAX_EXTRA_FOTOS } from "@/lib/shop/product-scherm";
import { SHOP_CATEGORIEEN } from "@/lib/shop/categorieen";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(120).optional(),
  description: z.string().trim().min(10).max(600).optional(),
  category: z.enum(SHOP_CATEGORIEEN).optional(),
  gender: z.enum(["heren", "vrouwen", "kinderen", "unisex"]).nullable().optional(),
  collection: z.string().trim().max(60).nullable().optional(),
  isBundle: z.boolean().optional(),
  priceCents: z.number().int().nonnegative().max(1_000_000).optional(),
  costCents: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  stock: z.number().int().nonnegative().max(1_000_000).optional(),
  imageUploadId: z.string().max(128).nullable().optional(),
  modelUploadId: z.string().max(128).nullable().optional(),
  imageUrl: shopImageRef.nullable().optional(),
  fotos: lijst(shopImageRef, { max: MAX_EXTRA_FOTOS }).optional(),
  modelPhotoUrl: shopImageRef.nullable().optional(),
  badge: z.string().trim().max(40).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const data = patchSchema.parse(await request.json()) as import("@prisma/client").Prisma.ShopProductUpdateInput;
  // tijdens een aanbieding is de prijs de actieprijs; de gewone prijs staat apart. Wie de prijs wil wijzigen, stopt eerst de aanbieding.
  if (typeof data.priceCents === "number") {
    const nu = await prisma.shopProduct.findUnique({ where: { id: params.id }, select: { priceCents: true, dealNormaalCents: true } });
    if (nu && nu.dealNormaalCents !== null && nu.priceCents !== data.priceCents) throw AppError.validation("Op dit product loopt een aanbieding. Stop die eerst; daarna kun je de prijs wijzigen.");
  }
  const product = await prisma.shopProduct.update({ where: { id: params.id }, data });
  await recordAudit({ category: "ADMIN", action: "shop.product.updated", actorUserId: principal.userId, actorLabel: "user", summary: `Shopproduct gewijzigd: ${product.name}`, targetType: "shop-product", targetId: product.id });
  return NextResponse.json({ product });
});

export const DELETE = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params, principal }) => {
  const product = await prisma.shopProduct.update({ where: { id: params.id }, data: { active: false } });
  await recordAudit({ category: "ADMIN", action: "shop.product.archived", actorUserId: principal.userId, actorLabel: "user", summary: `Shopproduct verborgen: ${product.name}`, targetType: "shop-product", targetId: product.id });
  return NextResponse.json({ product });
});
