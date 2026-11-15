import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { lijst } from "@/lib/http/zod-lijst";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { MAX_VARIANTEN, variantSleutel } from "@/lib/shop/product-scherm";

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

// PUT /api/shop/products/:id/variants — alle maten en kleuren in één keer (het productscherm, 15 nov 2026,
// lib/shop/product-scherm.ts). Wat er al was houdt zijn id en sku (bestellingen verwijzen ernaar), nieuwe combinaties komen
// erbij, wat er niet meer in staat gaat weg; de voorraad van het product is de som. In één transactie: mislukt er iets,
// dan blijft alles zoals het was.
const bulkSchema = z.object({
  varianten: lijst(z.object({ size: z.string().trim().max(20).nullable(), color: z.string().trim().max(40).nullable(), stock: z.number().int().nonnegative().max(1_000_000) }), { min: 1, max: MAX_VARIANTEN }),
});

export const PUT = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const parsed = bulkSchema.parse(await request.json());
  const product = await prisma.shopProduct.findUnique({ where: { id: params.id }, select: { id: true, name: true, slug: true } });
  if (!product) throw AppError.notFound("Product niet gevonden");

  // dubbele combinaties (zelfde maat en kleur) tellen één keer: de laatste wint
  const gewenst = new Map<string, { size: string | null; color: string | null; stock: number }>();
  for (const v of parsed.varianten) {
    const size = v.size?.trim() || null;
    const color = v.color?.trim() || null;
    gewenst.set(variantSleutel(size, color), { size, color, stock: v.stock });
  }

  const resultaat = await prisma.$transaction(async (tx) => {
    const bestaand = await tx.shopProductVariant.findMany({ where: { productId: product.id } });
    const perSleutel = new Map(bestaand.map((v) => [variantSleutel(v.size, v.color), v]));
    let nieuw = 0;
    let gewijzigd = 0;
    for (const [sleutel, v] of gewenst) {
      const oud = perSleutel.get(sleutel);
      if (oud) {
        if (oud.stock !== v.stock || oud.size !== v.size || oud.color !== v.color) {
          await tx.shopProductVariant.update({ where: { id: oud.id }, data: { stock: v.stock, size: v.size, color: v.color } });
          gewijzigd++;
        }
      } else {
        await tx.shopProductVariant.create({ data: { productId: product.id, size: v.size, color: v.color, priceCents: null, stock: v.stock, sku: `${product.slug}-${randomUUID().slice(0, 8)}` } });
        nieuw++;
      }
    }
    const weg = bestaand.filter((v) => !gewenst.has(variantSleutel(v.size, v.color))).map((v) => v.id);
    if (weg.length) await tx.shopProductVariant.deleteMany({ where: { id: { in: weg } } });
    const voorraad = [...gewenst.values()].reduce((s, v) => s + v.stock, 0);
    await tx.shopProduct.update({ where: { id: product.id }, data: { stock: voorraad } });
    const variants = await tx.shopProductVariant.findMany({ where: { productId: product.id }, orderBy: { createdAt: "asc" } });
    return { nieuw, gewijzigd, weg: weg.length, variants };
  });

  await recordAudit({
    category: "ADMIN",
    action: "shop.variant.bulk",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Maten en kleuren van "${product.name}": ${resultaat.nieuw} nieuw, ${resultaat.gewijzigd} gewijzigd, ${resultaat.weg} weg`,
    targetType: "shop-product",
    targetId: product.id,
  });

  return NextResponse.json({ variants: resultaat.variants });
});
