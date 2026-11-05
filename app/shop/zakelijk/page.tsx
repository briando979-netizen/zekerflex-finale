import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { canonical } from "@/lib/seo";
import { getDict } from "@/lib/i18n/server";
import { ShopStorefront } from "@/components/marketing/ShopStorefront";
import { ShopService } from "@/components/marketing/ShopSections";
import { toShopProduct } from "@/components/marketing/shop-product";
import { VasteModus, ZakelijkVastzetten } from "@/components/marketing/ShopModus";
import { ZakelijkHero, ZakelijkPakketten, ZakelijkVoordelen, type PakketKaart } from "@/components/marketing/zakelijk/ZakelijkSecties";
import { ZakelijkBestellen, type TeamProduct } from "@/components/marketing/zakelijk/ZakelijkBestellen";
import { PAKKETTEN } from "@/lib/shop/zakelijk";
import { btwTarief, zonderBtw } from "@/lib/shop/modus";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const z = (await getDict()).shopZakelijk;
  return { title: z.metaTitel, description: z.metaOmschrijving, ...canonical("/shop/zakelijk", { title: z.metaTitel, description: z.metaOmschrijving }) };
}

// De zakelijke startpagina van de shop: even volwaardig als de gewone, maar
// met prijzen zonder btw, pakketten per branche, een teambestelling per maat
// en een offerteverzoek dat als lead bij sales binnenkomt.
export default async function ZakelijkPage(props: { searchParams: Promise<{ pakket?: string }> }) {
  const { pakket } = await props.searchParams;
  const rows = await prisma.shopProduct
    .findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { variants: { orderBy: { createdAt: "asc" } }, seller: { select: { name: true } } },
    })
    .catch(() => []);
  const dict = await getDict();
  const z = dict.shopZakelijk;

  const koopbaar = rows.filter((r) => r.variants.length > 0);
  const perSlug = new Map(koopbaar.map((r) => [r.slug, r]));
  const pakketten: PakketKaart[] = PAKKETTEN.map((pk) => {
    const items = pk.slugs.map((s) => perSlug.get(s)).filter((r): r is (typeof koopbaar)[number] => Boolean(r));
    return {
      id: pk.id,
      look: pk.look ?? null,
      items: items.map((r) => ({ id: r.id, slug: r.slug, name: r.name, imageUrl: r.imageUrl, category: r.category })),
      perPersoonExcl: items.reduce((s, r) => s + zonderBtw(r.priceCents, btwTarief(r)), 0),
    };
  }).filter((pk) => pk.items.length >= 2);

  const teamProducten: TeamProduct[] = koopbaar.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, imageUrl: r.imageUrl, priceCents: r.priceCents, category: r.category,
    variants: r.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, priceCents: v.priceCents, stock: v.stock })),
  }));
  const start = typeof pakket === "string" && pakketten.some((pk) => pk.id === pakket) ? pakket : null;
  const products = rows.map((r) => toShopProduct(r as unknown as Record<string, unknown>));

  return (
    <VasteModus modus="zakelijk">
      <ZakelijkVastzetten />
      <ZakelijkHero z={z} />
      <ZakelijkVoordelen z={z} />
      <ZakelijkPakketten z={z} pakketten={pakketten} />
      <ZakelijkBestellen producten={teamProducten} pakketten={pakketten.map((pk) => ({ id: pk.id, productIds: pk.items.map((i) => i.id) }))} startPakket={start} />
      <ShopStorefront initialCat="Werk & PBM" products={products} />
      <ShopService t={dict.shop} />
    </VasteModus>
  );
}
