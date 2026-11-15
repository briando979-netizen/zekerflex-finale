import type { Metadata } from "next";
import { canonical } from "@/lib/seo";
import { prisma } from "@/lib/prisma";
import { beoordelingPerProduct } from "@/lib/shop/beoordeling-server";
import { getDict, getLocale } from "@/lib/i18n/server";
import { contentKeys, getContentMap } from "@/lib/content/store";
import { metShopTeksten } from "@/lib/ontwerp/shop-teksten";
import { ShopStorefront } from "@/components/marketing/ShopStorefront";
import { voorUitAdres } from "@/lib/shop/categoriemenu";
import { ShopFeatured } from "@/components/marketing/ShopProductCard";
import { OnlangsBekeken } from "@/components/marketing/OnlangsBekeken";
import { toShopProduct, type ShopCategory } from "@/components/marketing/shop-product";
import { ShopMoreCategories, ShopNewsletter, ShopPaskamerPromo, ShopService } from "@/components/marketing/ShopSections";
import { ShopCategorieGroot, ShopLooks, ShopThuisHero, type GroteTegel, type LookKaart } from "@/components/marketing/ShopThuis";
import { LOOKS } from "@/lib/shop/paskamer";
import { PaginaAchtergrond } from "@/components/shop/PaginaAchtergrond";
import { achtergrondVoor } from "@/lib/ontwerp/achtergrond";
import { Fragment, type ReactNode } from "react";
import { zichtbareShopSecties, type ShopSectieId } from "@/lib/ontwerp/shop-indeling";
import { getShopIndeling } from "@/lib/ontwerp/shop-indeling-store";
import { cadeauKeuzes, catalogusOverzicht, collectieUitAdres, ontdekTegels, prijsUitAdres, seizoenVan, themaKaarten, type EtalageProduct } from "@/lib/shop/etalage";
import { ShopAlles, ShopCadeauhulp, ShopOntdek, ShopRegelen, ShopThemas } from "@/components/marketing/ShopEtalage";

// <title> kort en zonder het sjabloon " · ZekerFlex" erachter (dan stond het merk er twee keer); delen houdt de lange
const title = "ZekerFlex Shop — kleding, werkkleding en PBM, eerst passen in de paskamer";
const korteTitel = "ZekerFlex Shop — kleding, werkkleding en PBM";
const description =
  "Kleding, veiligheidsschoenen, handschoenen en werkkleding. Pas het eerst op je eigen paspop; op werkdagen voor 22:00 besteld, de volgende werkdag in huis. Ook zakelijk bestellen.";

export const metadata: Metadata = {
  title: { absolute: korteTitel },
  description,
  ...canonical("/shop", { title, description }),
};

export const dynamic = "force-dynamic";

const CATS = ["Alles", "Werk & PBM", "Kleding", "Werkdag", "Cadeaus"] as const;
type Cat = (typeof CATS)[number];

export default async function ShopPage(props: { searchParams: Promise<{ cat?: string; q?: string; voor?: string; prijs?: string; collectie?: string }> }) {
  const searchParams = await props.searchParams;
  const initialCat: Cat = CATS.includes(searchParams.cat as Cat) ? (searchParams.cat as Cat) : "Alles";
  const initialVoor = voorUitAdres(searchParams.voor);
  const initialQuery = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 60) : "";
  // Op de server opgehaald en omgezet: de eerste HTML (en Google) toont de echte,
  // koopbare catalogus, en de browser krijgt alleen wat de kaarten nodig hebben.
  const rows = await prisma.shopProduct
    .findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { variants: { orderBy: { createdAt: "asc" } }, seller: { select: { name: true } } } })
    .catch(() => []);
  // sterren op de kaartjes: alleen goedgekeurde beoordelingen van echte kopers (lib/shop/beoordeling.ts)
  const scores = await beoordelingPerProduct(rows.map((r) => r.id)).catch(() => new Map<string, { gemiddelde: number; aantal: number }>());
  const products = rows.map((r) => toShopProduct({ ...(r as unknown as Record<string, unknown>), beoordeling: scores.get(r.id) ?? null }));
  // eigen teksten uit de Site-ontwerper (tabblad Teksten, groep Webshop); alleen in het Nederlands, anders de vertaling
  const dict = metShopTeksten(await getDict(), await getContentMap(contentKeys("shop.")).catch(() => ({})), await getLocale());
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
  // ?prijs= en ?collectie= komen van de thema's en de cadeauhulp (lib/shop/etalage.ts)
  const initialPrijs = prijsUitAdres(searchParams.prijs);
  const initialCollectie = collectieUitAdres(searchParams.collectie, rows.map((r) => r.collection));
  const browsing = initialQuery !== "" || initialCat !== "Alles" || initialVoor !== null || initialPrijs !== null || initialCollectie !== null;
  // de voorpagina zoals bol.com: Uitgelicht, thema's, cadeauhulp, Ontdek alles en Snel regelen, uit de echte catalogus
  const nu = new Date();
  const etalage: EtalageProduct[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    gender: p.gender ?? null,
    collection: p.collection ?? null,
    imageUrl: p.imageUrl ?? null,
    price: p.price,
    opVoorraad: p.variants.some((v) => v.stock > 0),
  }));
  const seizoen = seizoenVan(nu);

  // de onderdelen onder de kop: volgorde en zichtbaarheid komen uit de Site-ontwerper (tabblad Webshop, lib/ontwerp/shop-indeling.ts);
  // zonder eigen indeling is dit precies de oude volgorde. Wie zoekt of een categorie kiest, ziet alleen het assortiment en wat eronder hoort.
  const onderdelen: Record<ShopSectieId, ReactNode> = {
    ontdek: <ShopOntdek t={dict} seizoen={seizoen} tegels={ontdekTegels(etalage)} />,
    categorieen: <ShopCategorieGroot t={dict} tegels={tegels} />,
    themas: <ShopThemas t={dict} themas={themaKaarten(etalage, nu)} seizoen={seizoen} />,
    cadeauhulp: <ShopCadeauhulp t={dict} keuzes={cadeauKeuzes(etalage)} />,
    alles: <ShopAlles t={dict} kolommen={catalogusOverzicht(etalage)} />,
    regelen: <ShopRegelen t={dict} />,
    looks: <ShopLooks t={dict} looks={looks} />,
    populair: featured.length === 5 ? <ShopFeatured title={t.popular} products={featured} /> : null,
    onlangs: <OnlangsBekeken producten={products} />,
    paskamer: <ShopPaskamerPromo pk={dict.paskamer} />,
    assortiment: <ShopStorefront initialCat={initialCat} initialQuery={initialQuery} initialVoor={initialVoor} initialPrijs={initialPrijs} initialCollectie={initialCollectie} products={products} pageTitle={browsing} />,
    meer: <ShopMoreCategories t={t} />,
    service: <ShopService t={t} />,
    nieuwsbrief: <ShopNewsletter t={t} />,
  };
  const zichtbaar = zichtbareShopSecties(await getShopIndeling(), browsing);
  // De foto die de beheerder voor de webshop koos staat in de kop zelf (rechts, in het kader), niet meer als losse strook erboven:
  // anders staat dezelfde foto er twee keer. Een video blijft de strook; zonder keuze toont de kop de vaste teamfoto.
  const achtergrond = browsing ? null : await achtergrondVoor("shop");
  const kopFoto = achtergrond?.soort === "foto" ? { src: achtergrond.src, alt: achtergrond.alt } : null;

  return (
    <>
      {!browsing && achtergrond?.soort === "video" && <PaginaAchtergrond pagina="shop" />}
      {!browsing && <ShopThuisHero t={dict} {...(kopFoto ? { foto: kopFoto } : {})} />}
      {zichtbaar.map((id) => (
        <Fragment key={id}>{onderdelen[id]}</Fragment>
      ))}
    </>
  );
}
