"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { ShopProductCard } from "@/components/marketing/ShopProductCard";
import { toShopProduct, type ShopCardProduct } from "@/components/marketing/shop-product";
import { useOnlangsBekeken } from "@/components/marketing/useOnlangsBekeken";

// Een rij "Onlangs bekeken". Op de shop-startpagina komen de producten van de
// server mee; op een productpagina halen we de (openbare) catalogus pas op als
// er iets bekeken is. Niets bekeken → niets getoond.

export function OnlangsBekeken({ producten, behalve, ingebed = false }: { producten?: ShopCardProduct[]; behalve?: string; /** binnen een pagina die zelf al marges heeft (productpagina) */ ingebed?: boolean }) {
  const t = useT();
  const { ids, wis } = useOnlangsBekeken();
  const [opgehaald, setOpgehaald] = useState<ShopCardProduct[] | null>(null);
  const zichtbaar = ids.filter((id) => id !== behalve);

  useEffect(() => {
    if (producten || opgehaald || zichtbaar.length === 0) return;
    fetch("/api/shop/products")
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d: { products?: Record<string, unknown>[] }) => setOpgehaald((d.products ?? []).map(toShopProduct)))
      .catch(() => setOpgehaald([]));
  }, [producten, opgehaald, zichtbaar.length]);

  const lijst = useMemo(() => {
    const bron = new Map((producten ?? opgehaald ?? []).map((p) => [p.id, p]));
    return zichtbaar.map((id) => bron.get(id)).filter((p): p is ShopCardProduct => Boolean(p)).slice(0, 6);
  }, [producten, opgehaald, zichtbaar]);

  if (lijst.length === 0) return null;
  return (
    <section aria-labelledby="shop-onlangs" className={ingebed ? "mt-12 border-t border-hair pt-10" : "border-t border-hair bg-white"}>
      <div className={ingebed ? "" : "mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8"}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="shop-onlangs" className="font-display text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">
            {t.shopThuis.onlangsTitel}
          </h2>
          <button type="button" onClick={wis} className="text-[13px] font-semibold text-neutralx-600 underline-offset-2 hover:text-ink hover:underline">
            {t.shopThuis.onlangsWis}
          </button>
        </div>
        <ul className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:px-0">
          {lijst.map((p) => (
            <li key={p.id} className="relative w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-auto">
              <ShopProductCard p={p} sizes="(min-width: 1024px) 16vw, (min-width: 640px) 30vw, 46vw" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
