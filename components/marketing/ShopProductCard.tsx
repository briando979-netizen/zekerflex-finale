"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { useShopCart } from "@/components/marketing/useShopCart";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { GRID_SIZES, cardStock, priceParts, type ShopCardProduct } from "@/components/marketing/shop-product";

// Eén productkaart zoals op een grote marktplaats: foto, naam, opties, prijs,
// levering, verkoper en meteen "In winkelwagen". De naam is de link en dekt de
// hele kaart (::after); hartje en knop liggen erboven, zodat er geen knop in een
// link zit. Bij bewegen met de muis de tweede foto, pas dan geladen.

export const SELLER = "ZekerFlex";

export function ShopProductCard({
  p,
  sizes = GRID_SIZES,
  priority = false,
  titleLevel = "h3",
}: {
  p: ShopCardProduct;
  sizes?: string;
  priority?: boolean;
  /** h2 als de kaart direct onder de paginatitel staat (zoekresultaten), anders h3 */
  titleLevel?: "h2" | "h3";
}) {
  const Title = titleLevel;
  const t = useT();
  const { add, count } = useShopCart();
  const wishlist = useShopWishlist();
  const [hovered, setHovered] = useState(false);
  const [added, setAdded] = useState(false);
  const single = p.variants.length <= 1 ? p.variants[0] : null;
  const fav = wishlist.has(p.id);
  const stock = cardStock(p);
  const [euros, cents] = priceParts(p.price);
  const href = p.slug ? `/shop/${p.slug}` : null;

  const quickAdd = () => {
    if (!single || single.stock <= 0) return;
    add(single.id);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  return (
    <article
      id={p.slug ?? p.id}
      className="group relative flex h-full scroll-mt-40 flex-col rounded-xl border border-hair bg-white p-3 transition hover:border-hairstrong hover:shadow-e2 sm:p-4"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHovered(true);
      }}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-paper-soft">
        {p.imageUrl ? (
          <Image src={p.imageUrl} alt="" fill sizes={sizes} priority={priority} className="object-cover transition duration-500 ease-out-quint group-hover:scale-[1.03]" />
        ) : (
          <ProductPlaceholder name={p.name} slug={p.slug} category={p.category} glyphSize={48} className="text-neutralx-300" />
        )}
        {p.altImageUrl && hovered && <Image src={p.altImageUrl} alt="" fill sizes={sizes} className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}
        {p.label && <span className="absolute left-2 top-2 rounded-md bg-money-soft px-2 py-1 text-[11px] font-bold text-money-ink">{p.label}</span>}
      </div>

      <p className="mt-3 text-[12px] text-neutralx-500">{p.category === "Cadeaus" ? t.shop.navTeams : p.category}</p>
      <Title className="mt-0.5 line-clamp-2 min-h-[2.6em] text-[14px] font-semibold leading-[1.3] text-ink sm:text-[15px]">
        {href ? (
          <Link href={href} className="after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:underline focus-visible:outline-none">
            {p.name}
          </Link>
        ) : (
          p.name
        )}
      </Title>
      {p.variants.length > 1 && <p className="mt-1 text-[12px] text-neutralx-500">{fmt(t.shop.optionsCount, { n: p.variants.length })}</p>}

      <p className="mt-2 text-ink">
        <span className="sr-only">{`€ ${euros},${cents}`}</span>
        <span aria-hidden className="flex items-start">
          <span className="text-[22px] font-extrabold leading-none tracking-tight sm:text-[24px]">{euros},</span>
          <span className="text-[13px] font-extrabold leading-none">{cents}</span>
        </span>
      </p>

      <p className={`mt-2 text-[12px] font-semibold ${stock.kind === "uit" ? "text-crit" : "text-ok"}`}>
        {stock.kind === "uit" ? t.shop.soldOut : stock.kind === "weinig" ? fmt(t.shop.lowStock, { n: stock.n }) : t.shop.deliveryTomorrow}
      </p>
      <p className="mt-0.5 text-[12px] text-neutralx-500">{fmt(t.shop.soldBy, { seller: SELLER })}</p>

      <div className="relative z-10 mt-auto flex items-center gap-2 pt-3">
        {single ? (
          <button
            type="button"
            onClick={quickAdd}
            disabled={single.stock <= 0}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-[13px] font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutralx-300"
          >
            <IconCart />
            <span>{added ? "✓" : t.shop.addToCart}</span>
          </button>
        ) : href ? (
          <Link href={href} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-brand-500 px-3 text-[13px] font-bold text-brand-600 transition hover:bg-brand-50">
            {t.shop.chooseOptionShort}
          </Link>
        ) : null}
        <button
          type="button"
          aria-label={`${fav ? t.shop.removeFromFavorites : t.shop.addToFavorites}: ${p.name}`}
          aria-pressed={fav}
          onClick={() => wishlist.toggle(p.id)}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition ${fav ? "border-crit/30 bg-crit/5 text-crit" : "border-hair text-neutralx-600 hover:border-hairstrong hover:text-ink"}`}
        >
          <IconHeart filled={fav} />
        </button>
      </div>
      <span role="status" className="sr-only">
        {added ? fmt(t.shop.addedToCart, { n: count }) : ""}
      </span>
    </article>
  );
}

/** Een rij uitgelichte producten: op de telefoon en tablet te vegen, op een computer vijf naast elkaar. */
export function ShopFeatured({ title, products }: { title: string; products: ShopCardProduct[] }) {
  return (
    <section aria-labelledby="shop-uitgelicht" className="bg-paper-soft">
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <h2 id="shop-uitgelicht" className="font-display text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">
          {title}
        </h2>
        <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:px-0">
          {products.map((p, i) => (
            <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-auto">
              <ShopProductCard p={p} priority={i < 2} sizes="(min-width: 1024px) 20vw, (min-width: 640px) 30vw, 46vw" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function IconHeart({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7.5-4.6-10-9.1C.5 8.6 2 5 5.6 5 8 5 10 6.5 12 9c2-2.5 4-4 6.4-4C22 5 23.5 8.6 22 11.9 19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

export function IconCart({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </svg>
  );
}
