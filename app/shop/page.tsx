import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/server";
import { ShopStorefront } from "@/components/marketing/ShopStorefront";
import { ShopFeatured } from "@/components/marketing/ShopProductCard";
import { toShopProduct, type ShopCategory } from "@/components/marketing/shop-product";
import { ShopCategoryTiles, ShopMarketHero, ShopMoreCategories, ShopNewsletter, ShopService, type CategoryTile } from "@/components/marketing/ShopSections";

const title = "ZekerFlex Shop — werkkleding, PBM & werkdag-essentials";
const description =
  "Gecertificeerde veiligheidsschoenen, handschoenen, helmen en werkkleding. Voor 22:00 besteld, morgen in huis. Zakelijk bestellen op rekening.";

export const metadata: Metadata = {
  title,
  description,
  ...canonical("/shop", { title, description }),
};

export const dynamic = "force-dynamic";

const CATS = ["Alles", "Werk & PBM", "Kleding", "Werkdag", "Cadeaus"] as const;
type Cat = (typeof CATS)[number];

export default async function ShopPage(props: { searchParams: Promise<{ cat?: string; q?: string }> }) {
  const searchParams = await props.searchParams;
  const initialCat: Cat = CATS.includes(searchParams.cat as Cat) ? (searchParams.cat as Cat) : "Alles";
  const initialQuery = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 60) : "";
  // Op de server opgehaald en omgezet: de eerste HTML (en Google) toont de echte,
  // koopbare catalogus, en de browser krijgt alleen wat de kaarten nodig hebben.
  const rows = await prisma.shopProduct
    .findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { variants: { orderBy: { createdAt: "asc" } } } })
    .catch(() => []);
  const products = rows.map((r) => toShopProduct(r as unknown as Record<string, unknown>));
  const t = (await getDict()).shop;

  const tileDefs: { cat: ShopCategory; label: string }[] = [
    { cat: "Werk & PBM", label: t.navPbm },
    { cat: "Kleding", label: t.navKleding },
    { cat: "Werkdag", label: t.navWerkdag },
    { cat: "Cadeaus", label: t.navTeams },
  ];
  const tiles: CategoryTile[] = tileDefs
    .map((d) => ({ ...d, image: products.find((p) => p.category === d.cat && p.imageUrl)?.imageUrl ?? null, count: products.filter((p) => p.category === d.cat).length }))
    .filter((c) => c.count > 0);
  // uitgelicht: eerst producten met een label (bestseller, nieuw…), altijd met foto en op voorraad
  const withPhoto = products.filter((p) => p.imageUrl && p.variants.some((v) => v.stock > 0));
  const featured = [...withPhoto.filter((p) => p.label), ...withPhoto.filter((p) => !p.label)].slice(0, 5);
  // wie zoekt of een categorie kiest, wil meteen het assortiment zien: dan geen banner en rij ervoor
  const browsing = initialQuery !== "" || initialCat !== "Alles";

  return (
    <>
      {!browsing && <ShopMarketHero t={t} />}
      {!browsing && tiles.length > 1 && <ShopCategoryTiles t={t} tiles={tiles} />}
      {!browsing && featured.length === 5 && <ShopFeatured title={t.popular} products={featured} />}
      <ShopStorefront initialCat={initialCat} initialQuery={initialQuery} products={products} pageTitle={browsing} />
      <ShopMoreCategories t={t} />
      <ShopService t={t} />
      <ShopNewsletter t={t} />
    </>
  );
}
