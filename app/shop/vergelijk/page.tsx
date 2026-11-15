import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { idsUitAdres } from "@/lib/shop/vergelijk";
import { beoordelingPerProduct } from "@/lib/shop/beoordeling-server";
import { toShopProduct } from "@/components/marketing/shop-product";
import { ShopVergelijk, type VergelijkProduct } from "@/components/marketing/ShopVergelijk";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Producten vergelijken — ZekerFlex Shop" }, robots: { index: false } };

// Producten vergelijken, zoals bol.com (lib/shop/vergelijk.ts): de keuze staat in het adres (?ids=a,b), dus de link is te
// delen. Op de server opgehaald, zodat ook de verkoper en de beoordelingen kloppen; alleen actieve producten.
export default async function VergelijkPage(props: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const { ids } = await props.searchParams;
  const gevraagd = idsUitAdres(typeof ids === "string" ? ids : undefined);
  const rows = gevraagd.length
    ? await prisma.shopProduct
        .findMany({
          where: { id: { in: gevraagd }, active: true },
          include: { variants: { orderBy: { createdAt: "asc" } }, seller: { select: { name: true } } },
        })
        .catch(() => [])
    : [];
  const scores = await beoordelingPerProduct(rows.map((r) => r.id)).catch(() => new Map<string, { gemiddelde: number; aantal: number }>());
  const producten: VergelijkProduct[] = [];
  for (const id of gevraagd) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    producten.push({ ...toShopProduct({ ...(r as unknown as Record<string, unknown>), beoordeling: scores.get(r.id) ?? null }), collection: r.collection ?? null });
  }
  return <ShopVergelijk producten={producten} gevraagd={gevraagd} />;
}
