import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/server";
import { ShopStorefront } from "@/components/marketing/ShopStorefront";
import { ShopFeatured } from "@/components/marketing/ShopProductCard";
import { toShopProduct, type ShopCategory } from "@/components/marketing/shop-product";
import { ShopMoreCategories, ShopNewsletter, ShopPaskamerPromo, ShopService } from "@/components/marketing/ShopSections";
import { ShopCategorieGroot, ShopLooks, ShopThuisHero, type GroteTegel, type LookKaart } from "@/components/marketing/ShopThuis";
import { LOOKS } from "@/lib/shop/paskamer";

const title = "ZekerFlex Shop — kleding, werkkleding en PBM, eerst passen in de paskamer";
const description =
  "Kleding, veiligheidsschoenen, handschoenen en werkkleding. Pas het eerst op je eigen paspop, voor 22:00 besteld morgen in huis. Ook zakelijk bestellen.";

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
    .findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { variants: { orderBy: { createdAt: "asc" } }, seller: { select: { name: true } } } })
    .catch(() => []);
  const products = rows.map((r) => toShopProduct(r as unknown as Record<string, unknown>));
  const dict = await getDict();
  const t = dict.shop;

  const h = dict.shopThuis;
  // uitgelicht: eerst producten met een label (bestseller, nieuw…), altijd met foto en op voorraad
  const withPhoto = products.filter((p) => p.imageUrl && p.variants.some((v) => v.stock > 0));
  const featured = [...withPhoto.filter((p) => p.label), ...withPhoto.filter((p) => !p.label)].slice(0, 5);

  // de kop: vier echte producten met een eigen foto (geen dubbele beelden)
  const KOP = ["veiligheidsschoenen-s3", "business-blouse-dames", "fleece-vest-met-rits", "werk-tshirt-2pack", "chino-broek-zakelijk", "antislip-werkschoenen-ob", "business-overhemd-heren"];
  const gezien = new Set<string>();
  const uitgelicht = [...KOP.map((s) => withPhoto.find((p) => p.slug === s)), ...withPhoto]
    .filter((p): p is (typeof withPhoto)[number] => Boolean(p))
    .filter((p) => (p.imageUrl && !gezien.has(p.imageUrl) ? (gezien.add(p.imageUrl), true) : false))
    .slice(0, 4);

  // grote categorietegels, elk met een eigen foto
  const tegelDefs: { cat: ShopCategory; label: string; sub: string; voorkeur: string[] }[] = [
    { cat: "Kleding", label: t.navKleding, sub: h.kledingSub, voorkeur: ["fleece-vest-met-rits", "business-overhemd-heren", "everyday-hoodie"] },
    { cat: "Werk & PBM", label: t.navPbm, sub: h.pbmSub, voorkeur: ["veiligheidsschoenen-s3", "werkhandschoenen-grip"] },
    { cat: "Werkdag", label: t.navWerkdag, sub: h.werkdagSub, voorkeur: ["workday-tote", "shift-bottle"] },
    { cat: "Cadeaus", label: dict.shopZakelijk.navCadeaus, sub: h.cadeausSub, voorkeur: ["welcome-work-kit", "shift-socks-2-pack"] },
  ];
  const tegelFoto = new Set<string>(uitgelicht.map((p) => p.imageUrl ?? ""));
  const tegels: GroteTegel[] = tegelDefs
    .map((d) => {
      const inCat = products.filter((p) => p.category === d.cat);
      const kandidaten = [...d.voorkeur.map((s) => inCat.find((p) => p.slug === s)), ...inCat].filter((p): p is (typeof inCat)[number] => Boolean(p?.imageUrl));
      const keuze = kandidaten.find((p) => !tegelFoto.has(p.imageUrl ?? "")) ?? kandidaten[0];
      if (keuze?.imageUrl) tegelFoto.add(keuze.imageUrl);
      return { cat: d.cat, label: d.label, sub: d.sub, image: keuze?.imageUrl ?? null, count: inCat.length };
    })
    .filter((c) => c.count > 0);

  // Shop de look: kant-en-klare combinaties met leverbare stukken
  const perSlug = new Map(rows.filter((r) => r.variants.length > 0).map((r) => [r.slug, r]));
  const looks: LookKaart[] = ["weekend", "winter", "kantoor-dames", "buiten"]
    .map((id) => LOOKS.find((l) => l.id === id))
    .filter((l): l is (typeof LOOKS)[number] => Boolean(l))
    .map((look) => ({
      look,
      stukken: look.slugs
        .map((s) => perSlug.get(s))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => ({ slug: r.slug, name: r.name, priceCents: r.priceCents, kleur: null })),
    }))
    .filter((l) => l.stukken.length >= 2);
  // wie zoekt of een categorie kiest, wil meteen het assortiment zien: dan geen banner en rij ervoor
  const browsing = initialQuery !== "" || initialCat !== "Alles";

  return (
    <>
      {!browsing && <ShopThuisHero t={dict} uitgelicht={uitgelicht} />}
      {!browsing && <ShopCategorieGroot t={dict} tegels={tegels} />}
      {!browsing && <ShopLooks t={dict} looks={looks} />}
      {!browsing && featured.length === 5 && <ShopFeatured title={t.popular} products={featured} />}
      {!browsing && <ShopPaskamerPromo pk={dict.paskamer} />}
      <ShopStorefront initialCat={initialCat} initialQuery={initialQuery} products={products} pageTitle={browsing} />
      <ShopMoreCategories t={t} />
      <ShopService t={t} />
      <ShopNewsletter t={t} />
    </>
  );
}
