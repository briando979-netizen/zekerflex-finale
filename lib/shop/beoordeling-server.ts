import { prisma } from "@/lib/prisma";
import type { ShopOrderLine } from "@/lib/shop/bestelling-betaald";
import { isBeoordelingStatus, samenvatting, type ProductBeoordelingen, type TeBeoordelen, type ZichtbareBeoordeling } from "@/lib/shop/beoordeling";

export type { TeBeoordelen, ZichtbareBeoordeling };

// Beoordelingen uit de database (lib/shop/beoordeling.ts legt uit wie wat mag). Alleen "zichtbaar" komt op de site.

/** De producten uit een bestelling (via de varianten op de bon), met wat de koper er al over schreef. */
export async function teBeoordelen(orderId: string, regels: readonly ShopOrderLine[]): Promise<TeBeoordelen[]> {
  const variantIds = [...new Set(regels.map((r) => r.variantId).filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (!variantIds.length) return [];
  const [varianten, eigen] = await Promise.all([
    prisma.shopProductVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, product: { select: { id: true, name: true, slug: true, imageUrl: true } } },
    }),
    prisma.shopReview.findMany({ where: { orderId }, select: { productId: true, sterren: true, tekst: true, status: true } }),
  ]);
  const perVariant = new Map(varianten.map((v) => [v.id, v.product]));
  const perProduct = new Map(eigen.map((r) => [r.productId, r]));
  const uit: TeBeoordelen[] = [];
  for (const id of variantIds) {
    const p = perVariant.get(id);
    if (!p || uit.some((u) => u.productId === p.id)) continue;
    const r = perProduct.get(p.id);
    uit.push({
      productId: p.id,
      naam: p.name,
      slug: p.slug,
      imageUrl: p.imageUrl,
      beoordeling: r ? { sterren: r.sterren, tekst: r.tekst, status: isBeoordelingStatus(r.status) ? r.status : "wacht" } : null,
    });
  }
  return uit;
}

/** Wat de productpagina toont: de samenvatting over alle goedgekeurde beoordelingen en de nieuwste `max`. */
export async function zichtbareBeoordelingen(productId: string, max = 20): Promise<ProductBeoordelingen> {
  const rijen = await prisma.shopReview.findMany({
    where: { productId, status: "zichtbaar" },
    orderBy: { createdAt: "desc" },
    select: { id: true, naam: true, sterren: true, tekst: true, createdAt: true },
    take: 1000,
  });
  return {
    samenvatting: samenvatting(rijen.map((r) => r.sterren)),
    lijst: rijen.slice(0, max).map((r) => ({ id: r.id, naam: r.naam, sterren: r.sterren, tekst: r.tekst, datum: r.createdAt.toISOString() })),
  };
}

/** Gemiddelde en aantal per product, voor de kaartjes in de lijst; producten zonder goedgekeurde beoordeling ontbreken. */
export async function beoordelingPerProduct(productIds: readonly string[]): Promise<Map<string, { gemiddelde: number; aantal: number }>> {
  if (!productIds.length) return new Map();
  const groepen = await prisma.shopReview.groupBy({
    by: ["productId"],
    where: { status: "zichtbaar", productId: { in: [...productIds] } },
    _avg: { sterren: true },
    _count: { _all: true },
  });
  return new Map(groepen.map((g) => [g.productId, { gemiddelde: Math.round((g._avg.sterren ?? 0) * 10) / 10, aantal: g._count._all }]));
}
