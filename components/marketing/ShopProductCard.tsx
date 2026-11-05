"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { useShopCart } from "@/components/marketing/useShopCart";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { GRID_SIZES, bySize, cardStock, type ShopCardProduct } from "@/components/marketing/shop-product";
import { usePaskamerProfiel } from "@/components/marketing/paskamer/usePaskamer";
import { kleurHex, maatAdvies, matenVan, pastBijSilhouet, pasvormVoor } from "@/lib/shop/paskamer";
import { ShopPrijs } from "@/components/marketing/ShopPrijs";

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
  const href = p.slug ? `/shop/${p.slug}` : null;
  // draagbaar? dan een "Pas aan"-knop, en met een paskamerprofiel op dit toestel meteen jouw maat
  const profiel = usePaskamerProfiel();
  const pasvorm = useMemo(() => (p.slug ? pasvormVoor({ slug: p.slug, name: p.name, gender: p.gender ?? null }) : null), [p.slug, p.name, p.gender]);
  const maten = useMemo(() => matenVan(p, bySize), [p]);
  const jouwMaat =
    profiel && pasvorm && maten.length > 0 && pastBijSilhouet({ gender: p.gender ?? null, systeem: pasvorm.systeem }, profiel.lichaam.silhouet)
      ? maatAdvies(pasvorm.systeem, maten, profiel.lichaam).maat
      : null;
  const kleuren = [...new Set(p.variants.map((v) => v.color).filter((c): c is string => Boolean(c)))];

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
        <button
          type="button"
          aria-label={`${fav ? t.shop.removeFromFavorites : t.shop.addToFavorites}: ${p.name}`}
          aria-pressed={fav}
          onClick={() => wishlist.toggle(p.id)}
          className={`absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-e1 transition hover:bg-white ${fav ? "text-crit" : "text-neutralx-600 hover:text-ink"}`}
        >
          <IconHeart filled={fav} />
        </button>
        {pasvorm && p.slug && (
          <Link
            href={`/shop/paskamer?pas=${encodeURIComponent(p.slug)}`}
            aria-label={`${t.paskamer.probeerAan}: ${p.name}`}
            className="absolute bottom-2 left-2 z-10 inline-flex h-8 items-center gap-1 rounded-full bg-white/95 px-2.5 text-[11px] font-bold text-ink shadow-e1 transition hover:bg-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="4.5" r="2.5" />
              <path d="M7 9.5c1.5-1.2 3.2-1.8 5-1.8s3.5.6 5 1.8l-1.2 5.5H8.2zM9.5 15l-.8 6M14.5 15l.8 6" />
            </svg>
            {t.shopThuis.pasAanKort}
          </Link>
        )}
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
      {kleuren.length > 1 && (
        <p className="mt-1.5 flex items-center gap-1" aria-label={fmt(t.shopThuis.kleurenLabel, { kleuren: kleuren.join(", ") })}>
          {kleuren.slice(0, 5).map((k) => (
            <span key={k} title={k} aria-hidden className="h-3.5 w-3.5 rounded-full border border-black/15" style={{ background: kleurHex(k) ?? "#9aa0a6" }} />
          ))}
        </p>
      )}
      {jouwMaat && <p className="mt-1 text-[12px] font-semibold text-brand-700">{fmt(t.paskamer.jouwMaat, { maat: jouwMaat })}</p>}

      <div className="mt-2">
        <ShopPrijs centen={Math.round(p.price * 100)} product={p} />
      </div>

      <p className={`mt-2 text-[12px] font-semibold ${stock.kind === "uit" ? "text-crit" : "text-ok"}`}>
        {stock.kind === "uit" ? t.shop.soldOut : stock.kind === "weinig" ? fmt(t.shop.lowStock, { n: stock.n }) : p.seller ? t.shop.deliveryBySeller : t.shop.deliveryTomorrow}
      </p>
      <p className="mt-0.5 truncate text-[12px] text-neutralx-500">{fmt(t.shop.soldBy, { seller: p.seller ?? SELLER })}</p>

      <div className="relative z-10 mt-auto pt-3">
        {single ? (
          <button
            type="button"
            onClick={quickAdd}
            disabled={single.stock <= 0}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-500 px-2 text-[12px] font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutralx-300 min-[400px]:text-[13px] sm:gap-2 sm:px-3"
          >
            {/* op een smalle telefoon past alleen de tekst */}
            <span className="hidden min-[400px]:inline-flex">
              <IconCart />
            </span>
            <span>{added ? "✓" : t.shop.addToCart}</span>
          </button>
        ) : href ? (
          <Link href={href} className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-lg border border-brand-500 px-2 text-[12px] font-bold text-brand-600 transition hover:bg-brand-50 min-[400px]:text-[13px] sm:px-3">
            {t.shop.chooseOptionShort}
          </Link>
        ) : null}
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
