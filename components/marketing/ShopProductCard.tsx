"use client";

import { useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { useShopCart } from "@/components/marketing/useShopCart";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { useT } from "@/components/i18n/I18nProvider";
import { GRID_SIZES, shopMoney, type ShopCardProduct } from "@/components/marketing/shop-product";

// Eén productkaart in de etalage: foto op een warme ondergrond (via next/image,
// dus AVIF/WebP op de juiste breedte), bij bewegen met de muis de tweede foto —
// pas geladen bij de eerste keer bewegen, zodat telefoons hem nooit downloaden —
// een favorietenhartje en snel toevoegen.

const QUICK = "text-[11px] font-semibold uppercase tracking-[0.16em] text-lux-ink";

export function ShopProductCard({ p, sizes = GRID_SIZES, priority = false }: { p: ShopCardProduct; sizes?: string; priority?: boolean }) {
  const t = useT();
  const { add } = useShopCart();
  const wishlist = useShopWishlist();
  const [hovered, setHovered] = useState(false);
  const [added, setAdded] = useState(false);
  const single = p.variants.length <= 1 ? p.variants[0] : null;
  const fav = wishlist.has(p.id);

  const quickAdd = (e: MouseEvent) => {
    e.preventDefault();
    if (!single) return;
    add(single.id);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const body = (
    <>
      <div
        className="relative aspect-[4/5] overflow-hidden bg-lux-stone"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHovered(true);
        }}
      >
        {p.imageUrl ? (
          <Image src={p.imageUrl} alt={p.name} fill sizes={sizes} priority={priority} className="object-cover transition duration-700 ease-out-quint group-hover:scale-[1.03]" />
        ) : (
          <ProductPlaceholder name={p.name} slug={p.slug} category={p.category} glyphSize={56} className="text-[#C8BCA9]" />
        )}
        {p.altImageUrl && hovered && (
          <Image src={p.altImageUrl} alt="" fill sizes={sizes} className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        )}
        {p.label && <span className="absolute left-3 top-3 bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-lux-ink">{p.label}</span>}
        <button
          type="button"
          aria-label={fav ? t.shop.removeFromFavorites : t.shop.addToFavorites}
          aria-pressed={fav}
          onClick={(e) => {
            e.preventDefault();
            wishlist.toggle(p.id);
          }}
          className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full text-lux-ink transition hover:bg-white/80"
        >
          <IconHeart filled={fav} />
        </button>

        {/* computer: een balk die verschijnt bij bewegen */}
        <span className="pointer-events-none absolute inset-x-3 bottom-3 hidden translate-y-2 opacity-0 transition duration-300 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:hover)]:block">
          {single ? (
            <button type="button" onClick={quickAdd} className={`w-full bg-white/95 py-3 backdrop-blur transition hover:bg-white ${QUICK}`}>
              {added ? "✓" : t.shop.addToCart}
            </button>
          ) : (
            <span className={`block w-full bg-white/95 py-3 text-center backdrop-blur ${QUICK}`}>{t.shop.chooseOptionShort}</span>
          )}
        </span>
        {/* telefoon: een klein plusje, alleen als er niets te kiezen valt */}
        {single && (
          <button
            type="button"
            onClick={quickAdd}
            aria-label={t.shop.addToCart}
            className="absolute bottom-2.5 right-2.5 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-lux-ink shadow-e1 [@media(hover:hover)]:hidden"
          >
            {added ? "✓" : <IconPlus />}
          </button>
        )}
      </div>
      <div className="mt-3.5 flex items-start justify-between gap-3">
        <h3 className="text-[13px] leading-snug text-lux-ink">{p.name}</h3>
        <p className="shrink-0 text-[13px] text-lux-mute">{shopMoney(p.price)}</p>
      </div>
    </>
  );

  return p.slug ? (
    <Link href={`/shop/${p.slug}`} id={p.slug} className="group block scroll-mt-32">
      {body}
    </Link>
  ) : (
    <article id={p.id} className="group scroll-mt-32">
      {body}
    </article>
  );
}

/** Een rij uitgelichte producten: op de telefoon horizontaal te vegen, op een computer vier naast elkaar. */
export function ShopFeatured({ title, products }: { title: string; products: ShopCardProduct[] }) {
  return (
    <section className="bg-lux-bg">
      <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <h2 className="font-serif text-4xl text-lux-ink sm:text-5xl">{title}</h2>
        <div className="-mx-5 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0">
          {products.map((p) => (
            <div key={p.id} className="w-[68%] shrink-0 snap-start sm:w-[40%] lg:w-auto">
              <ShopProductCard p={p} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 40vw, 68vw" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function IconHeart({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7.5-4.6-10-9.1C.5 8.6 2 5 5.6 5 8 5 10 6.5 12 9c2-2.5 4-4 6.4-4C22 5 23.5 8.6 22 11.9 19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
