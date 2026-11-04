"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { Model3DViewer } from "@/components/marketing/Model3DViewer";
import { useShopCart } from "@/components/marketing/useShopCart";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { IconCart, IconHeart, SELLER, ShopProductCard } from "@/components/marketing/ShopProductCard";
import { CART_OPEN_EVENT } from "@/components/marketing/ShopChrome";
import { bySize, priceParts, type ShopCardProduct, type ShopCategory } from "@/components/marketing/shop-product";
import { specFor } from "@/lib/shop/product-specs";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

// De productpagina, opgebouwd als op een grote marktplaats. Telefoon: titel,
// foto, koopblok onder elkaar en een vaste koopknop onderin zodra de gewone uit
// beeld is. Computer: foto's links, titel en koopblok rechts (het koopblok blijft
// staan tijdens scrollen). Daaronder beschrijving, specificaties en verzending.

export type PdpVariant = { id: string; size: string | null; color: string | null; priceCents: number | null; stock: number };
export type PdpBundleItem = { id: string; name: string; imageUrl: string | null; priceCents: number };
export type PdpProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  stock: number;
  imageUrl: string | null;
  modelPhotoUrl: string | null;
  badge: string | null;
  variants: PdpVariant[];
  bundleItems?: PdpBundleItem[];
  /** 3D-model (glb) als de beheerder er een koppelde */
  model3dUrl?: string | null;
  /** verkoper op de marktplaats; null = ZekerFlex zelf */
  seller?: string | null;
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
  category: p.category as ShopCategory,
  label: p.badge,
  imageUrl: p.imageUrl,
  altImageUrl: p.modelPhotoUrl && p.modelPhotoUrl !== p.imageUrl ? p.modelPhotoUrl : null,
  variants: p.variants,
  seller: p.seller ?? null,
});

export function ProductDetail({ product, related, boughtTogether = false }: { product: PdpProduct; related: PdpProduct[]; boughtTogether?: boolean }) {
  const t = useT();
  const { add, count } = useShopCart();
  const wishlist = useShopWishlist();
  const spec = useMemo(() => specFor(product.slug, product.description), [product]);
  // ontdubbeld: een modelfoto die hetzelfde bestand is als de hoofdfoto stond er anders twee keer
  const gallery = [...new Set([product.imageUrl, product.modelPhotoUrl].filter(Boolean) as string[])];
  const [active, setActive] = useState(0);
  const [show3d, setShow3d] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [buyVisible, setBuyVisible] = useState(true);
  const buyRef = useRef<HTMLDivElement | null>(null);

  const sizes = useMemo(() => [...new Set(product.variants.map((v) => v.size).filter((s): s is string => Boolean(s)))].sort(bySize), [product.variants]);
  const colors = useMemo(() => [...new Set(product.variants.map((v) => v.color).filter((c): c is string => Boolean(c)))], [product.variants]);
  const [selSize, setSelSize] = useState<string | null>(sizes[0] ?? null);
  const [selColor, setSelColor] = useState<string | null>(colors[0] ?? null);
  const needsSelection = product.variants.length > 1;
  const variant = needsSelection
    ? product.variants.find((v) => (sizes.length === 0 || v.size === selSize) && (colors.length === 0 || v.color === selColor))
    : product.variants[0];
  const variantPriceCents = variant?.priceCents ?? product.priceCents;
  const variantStock = variant?.stock ?? product.stock;
  const canBuy = Boolean(variant) && variantStock > 0;
  const buyLabel = !variant ? t.shop.chooseOptionShort : variantStock <= 0 ? t.shop.soldOut : t.shop.addToCart;
  const [euros, cents] = priceParts(variantPriceCents / 100);
  const fav = wishlist.has(product.id);
  const shownImage = gallery[active] ?? gallery[0];

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
        </div>

        {/* foto's */}
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-hair bg-paper-soft">
            {!shownImage ? (
              <ProductPlaceholder name={product.name} slug={product.slug} category={product.category} glyphSize={96} className="text-neutralx-300" />
            ) : active === 0 && show3d && product.model3dUrl ? (
              <Model3DViewer src={product.model3dUrl} alt={`3D-model van ${product.name}`} poster={shownImage} className="h-full w-full" />
            ) : (
              <Image src={shownImage} alt={active === 0 ? product.name : ""} fill priority sizes="(min-width: 1440px) 720px, (min-width: 1024px) 52vw, 100vw" className="object-cover" />
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
            <div className="mt-3 flex gap-2">
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
          <p className="text-ink">
            <span className="sr-only">{money(variantPriceCents)}</span>
            <span aria-hidden className="flex items-start">
              <span className="text-[34px] font-extrabold leading-none tracking-tight">{euros},</span>
              <span className="text-[17px] font-extrabold leading-none">{cents}</span>
            </span>
          </p>
          <p className="mt-1.5 text-[13px] text-neutralx-500">{t.shop.inclVat}</p>

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
                    }}
                    className={option(selColor === c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className={`mt-5 text-[14px] font-bold ${variant && variantStock <= 0 ? "text-crit" : variant ? "text-ok" : "text-neutralx-600"}`}>
            {variant ? (variantStock > 0 ? fmt(t.shop.inStock, { n: variantStock }) : t.shop.outOfStockVariant) : t.shop.pickVariantForStock}
          </p>

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
              {(product.seller ? [t.shop.uspSellerShips, t.shop.freeShipping, t.shop.uspReturns, t.shop.uspPaySafe] : [t.shop.uspNextDay, t.shop.freeShipping, t.shop.uspReturns, t.shop.uspInvoice]).map((line) => (
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
              {(product.seller ? [fmt(t.shop.sellerShipsNote, { seller: product.seller }), t.shop.uspReturns, t.shop.securePaymentNote] : [t.shop.announcement, t.shop.uspReturns, t.shop.uspInvoice, t.shop.securePaymentNote]).map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="pdp-meer" className="mt-12 border-t border-hair pt-10">
          <h2 id="pdp-meer" className={H2}>
            {boughtTogether ? t.shop.boughtTogether : t.shop.alsoViewed}
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {related.map((r) => (
              <li key={r.id}>
                <ShopProductCard p={asCard(r)} sizes="(min-width: 768px) 25vw, 50vw" />
              </li>
            ))}
          </ul>
        </section>
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
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-5 text-[14px] font-bold text-white"
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
