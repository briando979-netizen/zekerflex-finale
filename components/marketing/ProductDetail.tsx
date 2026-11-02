"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { Model3DViewer } from "@/components/marketing/Model3DViewer";
import { useShopCart } from "@/components/marketing/useShopCart";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { IconHeart, ShopProductCard } from "@/components/marketing/ShopProductCard";
import { CART_OPEN_EVENT } from "@/components/marketing/ShopChrome";
import { bySize, type ShopCardProduct, type ShopCategory } from "@/components/marketing/shop-product";
import { specFor } from "@/lib/shop/product-specs";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";


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
};

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/** Een gerelateerd product als etalagekaart (zelfde kaart als op de shop-homepage). */
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
});

export function ProductDetail({ product, related, boughtTogether = false }: { product: PdpProduct; related: PdpProduct[]; boughtTogether?: boolean }) {
  const t = useT();
  const { add, count } = useShopCart();
  const wishlist = useShopWishlist();
  const spec = useMemo(() => specFor(product.slug, product.description), [product]);
  // De-duplicated: a product whose model photo is the same file as its main image
  // would otherwise show the same thumbnail twice (and collide on the React key).
  const gallery = [...new Set([product.imageUrl, product.modelPhotoUrl].filter(Boolean) as string[])];
  const [active, setActive] = useState(0);
  const [show3d, setShow3d] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const hasSize = Boolean(spec.sizeTable);

  const sizes = useMemo(
    () => [...new Set(product.variants.map((v) => v.size).filter((s): s is string => Boolean(s)))].sort(bySize),
    [product.variants],
  );
  const colors = useMemo(
    () => [...new Set(product.variants.map((v) => v.color).filter((c): c is string => Boolean(c)))],
    [product.variants],
  );
  const [selSize, setSelSize] = useState<string | null>(sizes[0] ?? null);
  const [selColor, setSelColor] = useState<string | null>(colors[0] ?? null);
  const needsSelection = product.variants.length > 1;
  const variant = needsSelection
    ? product.variants.find((v) => (sizes.length === 0 || v.size === selSize) && (colors.length === 0 || v.color === selColor))
    : product.variants[0];
  const variantPriceCents = variant?.priceCents ?? product.priceCents;
  const variantStock = variant?.stock ?? product.stock;

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 md:py-12 lg:px-12">
      <nav aria-label="Broodkruimel" className="mb-8 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-lux-mute">
        <Link href="/shop" className="hover:text-lux-ink">{t.shop.shopBreadcrumb}</Link>
        <span>/</span>
        <Link href={`/shop?cat=${encodeURIComponent(product.category)}#collectie`} className="hover:text-lux-ink">{product.category}</Link>
        <span>/</span>
        <span className="text-lux-ink">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        {/* galerij */}
        <div>
          <div className="relative overflow-hidden bg-lux-stone">
            {show3d && product.model3dUrl ? (
              <Model3DViewer src={product.model3dUrl} alt={`3D-model van ${product.name}`} poster={gallery[0] ?? null} className="aspect-[4/5] w-full" />
            ) : gallery.length > 0 ? (
              <div className="relative aspect-[4/5] w-full">
                <Image src={gallery[active] ?? gallery[0]!} alt={product.name} fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
              </div>
            ) : (
              <div className="aspect-[4/5] w-full"><ProductPlaceholder name={product.name} slug={product.slug} category={product.category} glyphSize={96} className="text-[#C8BCA9]" /></div>
            )}
            {product.model3dUrl && (
              <button
                type="button"
                onClick={() => setShow3d((v) => !v)}
                aria-pressed={show3d}
                className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink shadow-e1 transition hover:bg-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 2l8 4.5v11L12 22l-8-4.5v-11L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M12 22V11.5M20 6.5l-8 5-8-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
                {show3d ? "Terug naar foto" : "Bekijk in 3D"}
              </button>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="mt-3 flex gap-3">
              {gallery.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => {
                    setActive(i);
                    setShow3d(false);
                  }}
                  aria-label={`Foto ${i + 1}`}
                  className={`relative h-24 w-20 overflow-hidden border transition ${i === active && !show3d ? "border-lux-ink" : "border-transparent opacity-70 hover:opacity-100"}`}
                >
                  <Image src={src} alt="" fill sizes="80px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* info */}
        <div>
          <div className="flex items-start justify-between gap-3">
            {product.badge ? (
              <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.2em] text-lux-gold">{product.badge}</span>
            ) : <span />}
            <button
              type="button"
              aria-label={wishlist.has(product.id) ? t.shop.removeFromFavorites : t.shop.addToFavorites}
              aria-pressed={wishlist.has(product.id)}
              onClick={() => wishlist.toggle(product.id)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-lux-line text-lux-ink transition hover:border-lux-ink"
            >
              <IconHeart filled={wishlist.has(product.id)} />
            </button>
          </div>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] tracking-[-0.01em] text-lux-ink sm:text-5xl">{product.name}</h1>
          <p className="mt-5 text-xl text-lux-ink">{money(variantPriceCents)}</p>
          <p className="mt-1 text-[12px] text-lux-mute">{t.shop.inclVat}</p>
          {spec.fit && <p className="mt-5 text-[14px] text-lux-mute"><span className="text-lux-ink">{t.shop.fit}</span> {spec.fit}</p>}

          {sizes.length > 0 && (
            <div className="mt-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lux-mute">{t.shop.size}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={selSize === s}
                    onClick={() => { setSelSize(s); setAdded(false); }}
                    className={`min-w-12 border px-4 py-2.5 text-[13px] transition ${selSize === s ? "border-lux-ink bg-lux-ink text-white" : "border-lux-line text-lux-ink hover:border-lux-ink"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {colors.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lux-mute">{t.shop.color}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={selColor === c}
                    onClick={() => { setSelColor(c); setAdded(false); }}
                    className={`rounded-full border px-4 py-2 text-[13px] transition ${selColor === c ? "border-lux-ink bg-lux-ink text-white" : "border-lux-line text-lux-ink hover:border-lux-ink"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-lux-line">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Minder" className="px-4 py-3 text-lg">−</button>
              <span className="min-w-8 text-center text-[14px]">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="Meer" className="px-4 py-3 text-lg">+</button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!variant) return;
                add(variant.id, qty);
                setAdded(true);
                window.dispatchEvent(new Event(CART_OPEN_EVENT));
              }}
              disabled={!variant || variantStock <= 0}
              className="flex-1 rounded-full bg-lux-ink py-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-black disabled:opacity-40"
            >
              {!variant ? t.shop.chooseOptionShort : variantStock <= 0 ? t.shop.soldOut : t.shop.addToCart}
            </button>
          </div>
          {added && (
            <p role="status" className="mt-3 text-[13px] text-lux-ink">
              {fmt(t.shop.addedToCart, { n: count })}{" "}
              <Link href="/shop" className="underline underline-offset-4">{t.shop.continueShopping}</Link>
            </p>
          )}
          <p className="mt-3 text-[12px] text-lux-mute">
            {variant
              ? variantStock > 0
                ? fmt(t.shop.inStock, { n: variantStock })
                : t.shop.outOfStockVariant
              : t.shop.pickVariantForStock}
          </p>

          {product.bundleItems && product.bundleItems.length > 0 && (
            <div className="mt-7 border border-lux-line p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lux-mute">{t.shop.bundleContains}</p>
              <ul className="mt-3 space-y-2 text-[14px] text-lux-ink">
                {product.bundleItems.map((b) => (
                  <li key={b.id} className="flex items-center justify-between">
                    <span>{b.name}</span>
                    <span className="text-neutralx-400">{money(b.priceCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* productomschrijving */}
          <div className="mt-10 border-t border-lux-line pt-7">
            <h2 className="font-serif text-2xl text-lux-ink">{t.shop.productDescription}</h2>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-lux-mute">
              {spec.bullets.map((b) => (
                <li key={b} className="flex gap-3">
                  <span aria-hidden className="mt-[0.6rem] h-px w-3 shrink-0 bg-lux-gold" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* maattabel */}
          {hasSize && spec.sizeTable && (
            <div className="mt-6 border-t border-lux-line pt-6">
              <button type="button" onClick={() => setSizeOpen((o) => !o)} aria-expanded={sizeOpen} className="flex w-full items-center justify-between font-serif text-2xl text-lux-ink">
                {t.shop.sizeTable}
                <span className="font-sans text-lg font-light text-lux-mute">{sizeOpen ? "−" : "+"}</span>
              </button>
              {sizeOpen && (
                <div className="mt-4">
                  <p className="text-xs text-neutralx-500">{spec.sizeTable.note}</p>
                  {spec.sizeTable.legend && (
                    <ul className="mt-2 text-xs text-neutralx-500">
                      {spec.sizeTable.legend.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  )}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-hairstrong text-left">
                          {spec.sizeTable.columns.map((c) => (
                            <th key={c} className="py-2 pr-4 font-semibold">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {spec.sizeTable.rows.map((row) => (
                          <tr key={String(row[0])} className="border-b border-hair">
                            {row.map((cell, ci) => (
                              <td key={ci} className={`py-2 pr-4 ${ci === 0 ? "font-semibold" : "text-neutralx-600"}`}>
                                {typeof cell === "number" ? cell.toFixed(1) : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* gerelateerd */}
      {related.length > 0 && (
        <div className="mt-20 border-t border-lux-line pt-14">
          <h2 className="font-serif text-4xl text-lux-ink">{boughtTogether ? "Vaak samen gekocht" : t.shop.alsoViewed}</h2>
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 md:grid-cols-4">
            {related.map((r) => (
              <ShopProductCard key={r.id} p={asCard(r)} sizes="(min-width: 768px) 25vw, 50vw" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
