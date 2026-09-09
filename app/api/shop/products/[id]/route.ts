import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(120).optional(),
  description: z.string().trim().min(10).max(600).optional(),
  category: z.enum(["Kleding", "Werkdag", "Cadeaus"]).optional(),
  priceCents: z.number().int().nonnegative().max(1_000_000).optional(),
  costCents: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  stock: z.number().int().nonnegative().max(1_000_000).optional(),
  imageUploadId: z.string().max(128).nullable().optional(),
  modelUploadId: z.string().max(128).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  modelPhotoUrl: z.string().url().nullable().optional(),
  badge: z.string().trim().max(40).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const data = patchSchema.parse(await request.json()) as import("@prisma/client").Prisma.ShopProductUpdateInput;
  const product = await prisma.shopProduct.update({ where: { id: params.id }, data });
  await recordAudit({ category: "ADMIN", action: "shop.product.updated", actorUserId: principal.userId, actorLabel: "user", summary: `Shopproduct gewijzigd: ${product.name}`, targetType: "shop-product", targetId: product.id });
  return NextResponse.json({ product });
});

export const DELETE = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params, principal }) => {
  const product = await prisma.shopProduct.update({ where: { id: params.id }, data: { active: false } });
  await recordAudit({ category: "ADMIN", action: "shop.product.archived", actorUserId: principal.userId, actorLabel: "user", summary: `Shopproduct verborgen: ${product.name}`, targetType: "shop-product", targetId: product.id });
  return NextResponse.json({ product });
});
