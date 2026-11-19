"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { kleurStip } from "@/lib/shop/kleurfoto-naam";
import { Model3DViewer } from "@/components/marketing/Model3DViewer";
import { useShopCart } from "@/components/marketing/useShopCart";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { IconCart, IconHeart, SELLER, ShopProductCard } from "@/components/marketing/ShopProductCard";
import { CART_OPEN_EVENT } from "@/components/marketing/ShopChrome";
import { bySize, type ShopCardProduct, type ShopCategory } from "@/components/marketing/shop-product";
import { ShopPrijs } from "@/components/marketing/ShopPrijs";
import { useShopModus } from "@/components/marketing/ShopModus";
import { specFor } from "@/lib/shop/product-specs";
import { PaskamerTip } from "@/components/marketing/paskamer/PaskamerTip";
import { OnlangsBekeken } from "@/components/marketing/OnlangsBekeken";
import { SamenGekochtBundel, type SamenItem } from "@/components/marketing/SamenGekochtBundel";
import { useOnlangsBekeken } from "@/components/marketing/useOnlangsBekeken";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { useShopBetaalwijze } from "@/components/marketing/ShopBetaalwijze";
import { FotoViewer } from "@/components/marketing/FotoViewer";
import { VoorraadMelding } from "@/components/marketing/VoorraadMelding";
import { bezorgZin } from "@/lib/shop/bezorgmoment";
import { levertijdVoorLeverancier, type Herkomst } from "@/lib/shop/levertijd";
import { useBezorgmoment } from "@/components/marketing/useBezorgmoment";
import { useI18n } from "@/components/i18n/I18nProvider";
import { VERKOPER_VERZENDT_BINNEN_WERKDAGEN } from "@/lib/shop/verkoper-core";
import { beoordelingDatum, cijferTekst, type ProductBeoordelingen } from "@/lib/shop/beoordeling";
import { Sterren } from "@/components/marketing/Sterren";

// De productpagina, opgebouwd als op een grote marktplaats. Telefoon: titel,
// foto, koopblok onder elkaar en een vaste koopknop onderin zodra de gewone uit
// beeld is. Computer: foto's links, titel en koopblok rechts (het koopblok blijft
// staan tijdens scrollen). Daaronder beschrijving, specificaties en verzending.

export type PdpVariant = { id: string; size: string | null; color: string | null; priceCents: number | null; stock: number; /** de "van"-prijs van deze variant als er nu een aanbieding loopt */ vanCents?: number | null };
export type PdpBundleItem = { id: string; name: string; imageUrl: string | null; priceCents: number };
export type PdpProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  /** de "van"-prijs als er nu een aanbieding loopt (de server bepaalt dat), anders null */
  vanCents?: number | null;
  stock: number;
  imageUrl: string | null;
  modelPhotoUrl: string | null;
  /** extra foto's naast de hoofdfoto (Beheer → Webshop), in volgorde */
  fotos?: string[];
  badge: string | null;
  /** collectie (bijv. Winter 2026), voor de specificaties */
  collection?: string | null;
  variants: PdpVariant[];
  bundleItems?: PdpBundleItem[];
  /** 3D-model (glb) als de beheerder er een koppelde */
  model3dUrl?: string | null;
  /** verkoper op de marktplaats; null = ZekerFlex zelf */
  seller?: string | null;
  /** heren/vrouwen/kinderen/unisex: voor de paskamer (kindermaat of niet) */
  gender?: string | null;
  /** per kleur de foto in die kleur (lib/shop/kleurfoto.ts); klik je een kleur, dan verschijnt die foto */
  kleurFotos?: Record<string, string>;
  /** eigen voorraad, verkoper of leverancier (CJ): bepaalt de bezorgtekst (lib/shop/levertijd.ts) */
  herkomst?: Herkomst;
  /** levertijd van een leveranciersproduct in dagen, bv. "6-12" */
  levertijd?: string | null;
};

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const H2 = "font-display text-[20px] font-bold tracking-tight text-ink sm:text-[22px]";
const OPTION = "min-w-12 rounded-lg border px-3.5 py-2 text-[14px] font-semibold transition";
const option = (on: boolean) => `${OPTION} ${on ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "border-hairstrong bg-white text-ink hover:border-brand-500"}`;

/** Een gerelateerd product als kaart (zelfde kaart als op de shop-homepage). */
const asCard = (p: PdpProduct): ShopCardProduct => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  description: p.description,
  price: p.priceCents / 100,
  van: typeof p.vanCents === "number" ? p.vanCents / 100 : null,
  category: p.category as ShopCategory,
  label: p.badge,
  imageUrl: p.imageUrl,
  altImageUrl: p.modelPhotoUrl && p.modelPhotoUrl !== p.imageUrl ? p.modelPhotoUrl : null,
  variants: p.variants,
  seller: p.seller ?? null,
  herkomst: p.herkomst ?? "eigen",
  levertijd: p.levertijd ?? null,
});

export function ProductDetail({
  product,
  related,
  boughtTogether = false,
  beoordelingen = null,
}: {
  product: PdpProduct;
  related: PdpProduct[];
  boughtTogether?: boolean;
  /** goedgekeurde beoordelingen van kopers (lib/shop/beoordeling.ts); null = niet geladen */
  beoordelingen?: ProductBeoordelingen | null;
}) {
  const t = useT();
  const { add, count } = useShopCart();
  const wishlist = useShopWishlist();
  const spec = useMemo(() => specFor(product.slug, product.description), [product]);
  const [active, setActive] = useState(0);
  const [show3d, setShow3d] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [buyVisible, setBuyVisible] = useState(true);
  const buyRef = useRef<HTMLDivElement | null>(null);
  const sam = beoordelingen?.samenvatting ?? null;
  const aantalTekst = sam ? (sam.aantal === 1 ? t.shop.beoordelingEen : fmt(t.shop.beoordelingMeer, { n: sam.aantal })) : "";
  // wat de shop nu over betalen mag zeggen: hetzelfde als de kassa (online, per overschrijving, of even niet)
  const betaalwijze = useShopBetaalwijze();
  const betaalNoot = betaalwijze === "overschrijving" ? t.shop.bankPaymentNote : betaalwijze === "dicht" ? t.shop.paymentClosedNote : t.shop.securePaymentNote;
  // 16 nov 2026: kan bestellen nu niet, dan ook geen "bestel binnen … morgen in huis" en geen actieve knop voor de winkelwagen
  const bestellenDicht = betaalwijze === "dicht";
  // een product van de leverancier (CJ) heeft een levertijd in dagen in plaats van "morgen in huis" (18 nov 2026)
  const vanLeverancier = product.herkomst === "leverancier";
  const levertijd = product.levertijd ?? levertijdVoorLeverancier(null);
  // het bezorgmoment telt af (zoals bol.com), met werkdagen en feestdagen; pas in de browser uitgerekend (hydratie)
  const bezorg = useBezorgmoment(30_000);
  const { locale } = useI18n();

  const sizes = useMemo(() => [...new Set(product.variants.map((v) => v.size).filter((s): s is string => Boolean(s)))].sort(bySize), [product.variants]);
  const colors = useMemo(() => [...new Set(product.variants.map((v) => v.color).filter((c): c is string => Boolean(c)))], [product.variants]);
  const [selSize, setSelSize] = useState<string | null>(sizes[0] ?? null);
  const [selColor, setSelColor] = useState<string | null>(colors[0] ?? null);
  // de foto in de gekozen kleur staat vooraan (lib/shop/kleurfoto.ts); zonder kleurfoto de gewone hoofdfoto.
  // Ontdubbeld: een modelfoto die hetzelfde bestand is als de hoofdfoto stond er anders twee keer.
  const kleurFoto = selColor ? product.kleurFotos?.[selColor] : undefined;
  const gallery = [...new Set([kleurFoto ?? product.imageUrl, ...(product.fotos ?? []), product.modelPhotoUrl].filter(Boolean) as string[])];
  const needsSelection = product.variants.length > 1;
  const variant = needsSelection
    ? product.variants.find((v) => (sizes.length === 0 || v.size === selSize) && (colors.length === 0 || v.color === selColor))
    : product.variants[0];
  const variantPriceCents = variant?.priceCents ?? product.priceCents;
  // een variant met een eigen prijs heeft zijn eigen "van"-prijs; anders die van het product
  const variantVanCents = typeof variant?.priceCents === "number" ? (variant.vanCents ?? null) : (product.vanCents ?? null);
  const variantStock = variant?.stock ?? product.stock;
  const canBuy = Boolean(variant) && variantStock > 0 && !bestellenDicht;
  const buyLabel = bestellenDicht ? t.shop.orderClosedShort : !variant ? t.shop.chooseOptionShort : variantStock <= 0 ? t.shop.soldOut : t.shop.addToCart;
  // bol.com-koopset: aanbevolen artikelen op voorraad (hooguit twee); een artikel met maten/kleuren krijgt in de set een eigen keuze
  const samenBron = useMemo(() => related.filter((r) => r.variants.some((v) => v.stock > 0)).slice(0, 2), [related]);
  const samenCompanions = useMemo<SamenItem[]>(
    () => samenBron.map((r) => ({ slug: r.slug, name: r.name, imageUrl: r.imageUrl, basePriceCents: r.priceCents, variants: r.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, priceCents: v.priceCents, stock: v.stock })) })),
    [samenBron],
  );
  const toonBundel = samenCompanions.length > 0 && !bestellenDicht;
  // de koopset-artikelen niet nog een keer in het raster eronder
  const gridItems = toonBundel ? related.filter((r) => !samenBron.includes(r)) : related;
  const { modus } = useShopModus();
  const fav = wishlist.has(product.id);
  // onthouden voor "Onlangs bekeken" (alleen in deze browser)
  const { bekeken } = useOnlangsBekeken();
  useEffect(() => {
    bekeken(product.id);
  }, [bekeken, product.id]);
  const shownImage = gallery[active] ?? gallery[0];
  // de fotoviewer (groot, inzoomen, bladeren); bij sluiten blijft de laatst bekeken foto staan en krijgt hij de focus terug
  const [viewer, setViewer] = useState(false);
  const fotoKnopRef = useRef<HTMLButtonElement | null>(null);
  const sluitViewer = useCallback((n: number) => {
    setViewer(false);
    setActive(n);
    setShow3d(false);
    requestAnimationFrame(() => fotoKnopRef.current?.focus());
  }, []);

  // de vaste koopknop op de telefoon staat er zolang de gewone niet in beeld is
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setBuyVisible(Boolean(e?.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const addToCart = () => {
    if (!variant || variantStock <= 0) return;
    add(variant.id, qty);
    setAdded(true);
    window.dispatchEvent(new Event(CART_OPEN_EVENT));
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-14">
      <nav aria-label="Broodkruimel" className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-neutralx-500">
        <Link href="/shop" className="shrink-0 text-brand-600 hover:underline">
          {t.shop.shopBreadcrumb}
        </Link>
        <span aria-hidden>›</span>
        <Link href={`/shop?cat=${encodeURIComponent(product.category)}#collectie`} className="shrink-0 text-brand-600 hover:underline">
          {product.category === "Cadeaus" ? t.shop.navTeams : product.category}
        </Link>
        <span aria-hidden>›</span>
        <span className="min-w-0 truncate">{product.name}</span>
      </nav>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-5">
        {/* titel (op de telefoon boven de foto) */}
        <div className="lg:col-start-2 lg:row-start-1">
          {product.badge && <span className="mb-2 inline-block rounded-md bg-money-soft px-2 py-1 text-[12px] font-bold text-money-ink">{product.badge}</span>}
          <h1 className="font-display text-[24px] font-bold leading-tight tracking-tight text-ink sm:text-[30px]">{product.name}</h1>
          <p className="mt-2 text-[14px] text-neutralx-500">
            {fmt(t.shop.soldBy, { seller: product.seller ?? SELLER })}
            {spec.fit && (
              <>
                {" · "}
                <span className="text-ink">{t.shop.fit}</span> {spec.fit}
              </>
            )}
          </p>
          {sam && sam.aantal > 0 && (
            <a href="#beoordelingen" className="mt-1.5 inline-flex items-center gap-2 text-[14px] text-neutralx-600 hover:underline">
              <Sterren gemiddelde={sam.gemiddelde} grootte={16} label={fmt(t.shop.sterrenVan5, { cijfer: cijferTekst(sam.gemiddelde) })} />
              <span className="font-semibold text-ink">{cijferTekst(sam.gemiddelde)}</span>
              <span>({aantalTekst})</span>
            </a>
          )}
        </div>

        {/* foto's */}
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-hair bg-paper-soft">
            {!shownImage ? (
              <ProductPlaceholder name={product.name} slug={product.slug} category={product.category} glyphSize={96} className="text-neutralx-300" />
            ) : active === 0 && show3d && product.model3dUrl ? (
              <Model3DViewer src={product.model3dUrl} alt={`3D-model van ${product.name}`} poster={shownImage} className="h-full w-full" />
            ) : (
              <button ref={fotoKnopRef} type="button" onClick={() => setViewer(true)} aria-label={t.shop.fotoVergroot} className="absolute inset-0 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ink">
                <Image src={shownImage} alt={active === 0 ? product.name : ""} fill priority sizes="(min-width: 1440px) 720px, (min-width: 1024px) 52vw, 100vw" className="object-cover" />
              </button>
            )}
            {active === 0 && product.model3dUrl && (
              <button
                type="button"
                onClick={() => setShow3d((v) => !v)}
                aria-pressed={show3d}
                className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-bold text-ink shadow-e1 transition hover:bg-paper-soft"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 2l8 4.5v11L12 22l-8-4.5v-11L12 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M12 22V11.5M20 6.5l-8 5-8-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
                {show3d ? "Terug naar foto" : "Bekijk in 3D"}
              </button>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {/* flex-wrap: vijf of meer miniaturen (CJ-producten) maakten de pagina op een telefoon 18 px te breed (18 nov 2026) */}
              {gallery.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => {
                    setActive(i);
                    setShow3d(false);
                  }}
                  aria-label={fmt(t.shop.photoOf, { n: i + 1, total: gallery.length })}
                  aria-pressed={active === i}
                  className={`relative h-[72px] w-[72px] overflow-hidden rounded-lg border-2 transition ${active === i ? "border-brand-500" : "border-hair hover:border-hairstrong"}`}
                >
                  <Image src={src} alt="" fill sizes="72px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* koopblok */}
        <section aria-label={t.shop.addToCart} className="self-start rounded-xl border border-hair bg-white p-5 shadow-e1 sm:p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2">
          <ShopPrijs centen={variantPriceCents} product={product} groot vanCenten={variantVanCents} />
          <p className="mt-1.5 text-[13px] text-neutralx-500">{modus === "zakelijk" ? t.shopZakelijk.pdpBtwRegel : t.shop.inclVat}</p>

          {sizes.length > 0 && (
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <p className="text-[14px] font-bold text-ink">
                  {t.shop.size}
                  {selSize ? <span className="font-normal text-neutralx-600">: {selSize}</span> : null}
                </p>
                {spec.sizeTable && (
                  <a href="#maattabel" className="text-[13px] font-semibold text-brand-600 underline underline-offset-2">
                    {t.shop.sizeTable}
                  </a>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={selSize === s}
                    onClick={() => {
                      setSelSize(s);
                      setAdded(false);
                    }}
                    className={option(selSize === s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {colors.length > 0 && (
            <div className="mt-4">
              <p className="text-[14px] font-bold text-ink">
                {t.shop.color}
                {selColor ? <span className="font-normal text-neutralx-600">: {selColor}</span> : null}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={selColor === c}
                    onClick={() => {
                      setSelColor(c);
                      setAdded(false);
                      // de foto in die kleur meteen tonen
                      setActive(0);
                      setShow3d(false);
                    }}
                    className={`${option(selColor === c)} inline-flex items-center gap-1.5`}
                  >
                    {kleurStip(c) && <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border border-black/15" style={{ backgroundColor: kleurStip(c) ?? undefined }} />}
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <PaskamerTip
            product={product}
            gekozen={selSize}
            onKiesMaat={(m) => {
              setSelSize(m);
              setAdded(false);
            }}
          />

          <p className={`mt-5 text-[14px] font-bold ${variant && variantStock <= 0 ? "text-crit" : variant ? "text-ok" : "text-neutralx-600"}`}>
            {variant ? (variantStock > 0 ? fmt(t.shop.inStock, { n: variantStock }) : t.shop.outOfStockVariant) : t.shop.pickVariantForStock}
          </p>
          {variant && variantStock <= 0 && <VoorraadMelding key={variant.id} variantId={variant.id} />}
          {variant && variantStock > 0 && product.seller && !bestellenDicht && (
            <p className="mt-1 text-[13px] font-semibold text-neutralx-600">{fmt(t.shop.bezorgVerkoper, { seller: product.seller, n: VERKOPER_VERZENDT_BINNEN_WERKDAGEN })}</p>
          )}
          {variant && variantStock > 0 && vanLeverancier && !bestellenDicht && (
            <p className="mt-1 text-[13px] font-semibold text-neutralx-600">{fmt(t.shop.bezorgLeverancier, { dagen: levertijd })}</p>
          )}
          {bezorg && variant && variantStock > 0 && !product.seller && !bestellenDicht && !vanLeverancier && (
            <p className="mt-1 text-[13px] font-semibold text-ok">
              {bezorgZin(bezorg, { aftellen: t.shop.bezorgAftellen, nu: t.shop.bezorgNu, morgen: t.shop.bezorgMorgen, uurEnMin: t.shop.uurEnMin, uren: t.shop.uren, minuten: t.shop.minuten }, locale)}
            </p>
          )}

          <div ref={buyRef} className="mt-4 flex items-center gap-2.5">
            <label className="sr-only" htmlFor="pdp-aantal">
              {t.shop.quantity}
            </label>
            <select
              id="pdp-aantal"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="h-12 w-[4.5rem] shrink-0 rounded-lg border border-hairstrong bg-white px-2 text-center text-[15px] font-semibold text-ink"
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addToCart}
              disabled={!canBuy}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutralx-300"
            >
              <IconCart size={19} />
              {buyLabel}
            </button>
          </div>
          {added && (
            <p role="status" className="mt-3 text-[13px] text-ink">
              {fmt(t.shop.addedToCart, { n: count })}{" "}
              <Link href="/shop" className="font-semibold text-brand-600 underline underline-offset-2">
                {t.shop.continueShopping}
              </Link>
            </p>
          )}
          <button
            type="button"
            aria-pressed={fav}
            onClick={() => wishlist.toggle(product.id)}
            className={`mt-3 inline-flex items-center gap-2 text-[14px] font-semibold ${fav ? "text-crit" : "text-brand-600 hover:underline"}`}
          >
            <IconHeart filled={fav} />
            {fav ? t.shop.removeFromFavorites : t.shop.addToFavorites}
          </button>

          <div className="mt-5 border-t border-hair pt-4">
            <p className="text-[14px] font-bold text-ink">{fmt(t.shop.buyBoxSeller, { seller: product.seller ?? SELLER })}</p>
            <ul className="mt-2.5 space-y-2 text-[13px] text-neutralx-600">
              {(product.seller ? [t.shop.uspSellerShips, t.shop.freeShipping, t.shop.uspReturns, t.shop.uspPaySafe] : [vanLeverancier ? fmt(t.shop.uspLevertijd, { dagen: levertijd }) : t.shop.uspNextDay, t.shop.freeShipping, t.shop.uspReturns, t.shop.uspInvoice]).map((line) => (
                <li key={line} className="flex gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-ok" aria-hidden>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* beschrijving en specificaties */}
      <div className="mt-12 grid gap-10 border-t border-hair pt-10 lg:grid-cols-2 lg:gap-12">
        <section aria-labelledby="pdp-beschrijving">
          <h2 id="pdp-beschrijving" className={H2}>
            {t.shop.productDescription}
          </h2>
          <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-neutralx-700">
            {spec.bullets.map((b) => (
              <li key={b} className="flex gap-3">
                <span aria-hidden className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {/* specificaties, zoals bol.com: alles wat vaststaat in één tabel */}
          <h3 className="mt-8 text-[17px] font-bold text-ink">{t.shop.specificaties}</h3>
          <table className="mt-3 w-full overflow-hidden rounded-xl border border-hair text-[14px]">
            <tbody>
              {(
                [
                  [t.shop.specCategorie, product.category],
                  ...(product.gender ? [[t.shop.specDoelgroep, product.gender === "heren" ? t.shop.doelHeren : product.gender === "vrouwen" ? t.shop.doelVrouwen : product.gender === "kinderen" ? t.shop.doelKinderen : t.shop.doelUnisex]] : []),
                  ...(product.collection ? [[t.shop.specCollectie, product.collection]] : []),
                  ...(sizes.length ? [[t.shop.specMaten, sizes.join(", ")]] : []),
                  ...(colors.length ? [[t.shop.specKleuren, colors.join(", ")]] : []),
                  [t.shop.specVerkoper, product.seller ?? "ZekerFlex"],
                ] as [string, string][]
              ).map(([k, v], i) => (
                <tr key={k} className={i % 2 ? "bg-white" : "bg-paper-soft"}>
                  <th scope="row" className="w-2/5 px-4 py-2.5 text-left font-semibold text-neutralx-600">{k}</th>
                  <td className="px-4 py-2.5 text-ink">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {product.bundleItems && product.bundleItems.length > 0 && (
            <div className="mt-6 rounded-xl border border-hair p-5">
              <p className="text-[14px] font-bold text-ink">{t.shop.bundleContains}</p>
              <ul className="mt-3 space-y-2 text-[14px] text-ink">
                {product.bundleItems.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-4">
                    <span>{b.name}</span>
                    <span className="text-neutralx-500">{money(b.priceCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="space-y-10">
          {spec.sizeTable && (
            <section id="maattabel" aria-labelledby="pdp-maattabel" className="scroll-mt-32 lg:scroll-mt-24">
              <h2 id="pdp-maattabel" className={H2}>
                {t.shop.sizeTable}
              </h2>
              <p className="mt-2 text-[13px] text-neutralx-500">{spec.sizeTable.note}</p>
              {spec.sizeTable.legend && (
                <ul className="mt-1 text-[13px] text-neutralx-500">
                  {spec.sizeTable.legend.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              <div className="mt-4 overflow-x-auto rounded-xl border border-hair">
                <table className="w-full min-w-[320px] border-collapse text-[14px]">
                  <thead className="bg-paper-soft">
                    <tr className="text-left">
                      {spec.sizeTable.columns.map((c) => (
                        <th key={c} scope="col" className="px-4 py-2.5 font-bold text-ink">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {spec.sizeTable.rows.map((row) => (
                      <tr key={String(row[0])} className="border-t border-hair">
                        {row.map((cell, ci) => (
                          <td key={ci} className={`px-4 py-2.5 ${ci === 0 ? "font-bold text-ink" : "text-neutralx-600"}`}>
                            {typeof cell === "number" ? cell.toFixed(1) : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section aria-labelledby="pdp-verzending">
            <h2 id="pdp-verzending" className={H2}>
              {t.shop.shippingReturns}
            </h2>
            <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-neutralx-700">
              {(product.seller ? [fmt(t.shop.sellerShipsNote, { seller: product.seller }), t.shop.uspReturns, betaalNoot] : [...(bestellenDicht ? [] : [vanLeverancier ? fmt(t.shop.uspLevertijd, { dagen: levertijd }) : t.shop.announcement]), t.shop.uspReturns, t.shop.uspInvoice, betaalNoot]).map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* beoordelingen van echte kopers, zoals bol.com; zonder beoordelingen zegt de pagina dat eerlijk */}
      {beoordelingen && sam && (
        <section id="beoordelingen" aria-labelledby="pdp-beoordelingen" className="mt-12 scroll-mt-32 border-t border-hair pt-10 lg:scroll-mt-24">
          <h2 id="pdp-beoordelingen" className={H2}>
            {t.shop.beoordelingen}
          </h2>
          {sam.aantal === 0 ? (
            <div className="mt-4 rounded-xl border border-hair bg-paper-soft p-5">
              <p className="text-[15px] font-semibold text-ink">{t.shop.beoordelingGeen}</p>
              <p className="mt-1 text-[14px] text-neutralx-600">{t.shop.beoordelingGeenUitleg}</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div>
                <p className="font-display text-[44px] font-bold leading-none text-ink">{cijferTekst(sam.gemiddelde)}</p>
                <div className="mt-2">
                  <Sterren gemiddelde={sam.gemiddelde} grootte={20} label={fmt(t.shop.sterrenVan5, { cijfer: cijferTekst(sam.gemiddelde) })} />
                </div>
                <p className="mt-1 text-[13px] text-neutralx-600">{aantalTekst}</p>
                <ul className="mt-4 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const c = sam.verdeling[n - 1] ?? 0;
                    return (
                      <li key={n} className="flex items-center gap-2 text-[13px] text-neutralx-600">
                        <span className="w-16 shrink-0">{n === 1 ? t.shop.sterLabel1 : fmt(t.shop.sterLabelN, { n })}</span>
                        <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-paper-soft">
                          <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.round((c / sam.aantal) * 100)}%` }} />
                        </span>
                        <span className="w-6 shrink-0 text-right">{c}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 text-[12px] text-neutralx-500">{t.shop.beoordelingUitleg}</p>
              </div>
              <ul className="divide-y divide-hair">
                {beoordelingen.lijst.map((r) => (
                  <li key={r.id} className="py-4 first:pt-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Sterren gemiddelde={r.sterren} label={fmt(t.shop.sterrenVan5, { cijfer: String(r.sterren) })} />
                      <span className="text-[14px] font-semibold text-ink">{r.naam}</span>
                      <span className="text-[12px] font-semibold text-trust-ink">{t.shop.beoordelingKoper}</span>
                      <span className="text-[12px] text-neutralx-500">{beoordelingDatum(r.datum, locale)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-neutralx-700">{r.tekst}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {toonBundel && (
        <SamenGekochtBundel
          titel={boughtTogether ? t.shop.boughtTogether : t.shop.samenCompleet}
          hoofd={{ name: product.name, slug: product.slug, imageUrl: gallery[0] ?? product.imageUrl, variantId: variant?.id ?? null, priceCents: variantPriceCents }}
          companions={samenCompanions}
        />
      )}

      {gridItems.length > 0 && (
        <section aria-labelledby="pdp-meer" className="mt-12 border-t border-hair pt-10">
          <h2 id="pdp-meer" className={H2}>
            {toonBundel ? t.shop.alsoViewed : boughtTogether ? t.shop.boughtTogether : t.shop.alsoViewed}
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {gridItems.map((r) => (
              <li key={r.id}>
                <ShopProductCard p={asCard(r)} sizes="(min-width: 768px) 25vw, 50vw" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <OnlangsBekeken behalve={product.id} ingebed />

      {viewer && gallery.length > 0 && (
        <FotoViewer
          fotos={gallery}
          start={active}
          titel={product.name}
          teksten={{ sluiten: t.shop.close, vorige: t.shop.fotoVorige, volgende: t.shop.fotoVolgende, fotoVan: t.shop.photoOf, inzoomen: t.shop.fotoInzoomen, uitzoomen: t.shop.fotoUitzoomen }}
          onSluit={sluitViewer}
        />
      )}

      {/* telefoon: vaste koopknop zodra de gewone uit beeld is */}
      {!buyVisible && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hair bg-white/95 px-4 pt-3 backdrop-blur lg:hidden" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{product.name}</p>
              <p className="text-[15px] font-extrabold text-ink">{money(variantPriceCents)}</p>
            </div>
            <button
              type="button"
              onClick={() => (canBuy ? addToCart() : buyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }))}
              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-lg px-5 text-[14px] font-bold text-white ${bestellenDicht ? "bg-neutralx-300" : "bg-brand-500"}`}
            >
              <IconCart size={17} />
              {buyLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
