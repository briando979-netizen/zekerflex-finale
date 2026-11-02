"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { ShopProductCard } from "@/components/marketing/ShopProductCard";
import { bySize, type ShopCardProduct, type ShopCategory } from "@/components/marketing/shop-product";

// De collectie op de shop-homepage: categorie-tabs, zoeken, en filters/sorteren
// in een uitschuifpaneel. De producten komen van de server (app/shop/page.tsx);
// de vaste delen eromheen staan in ShopSections.

export { IconHeart } from "@/components/marketing/ShopProductCard";

type Category = "Alles" | ShopCategory;
type Gender = "Alle" | "Heren" | "Vrouwen" | "Kinderen";
const GENDER_VALUE: Record<Exclude<Gender, "Alle">, string> = { Heren: "heren", Vrouwen: "vrouwen", Kinderen: "kinderen" };
const GENDERS: Gender[] = ["Alle", "Heren", "Vrouwen", "Kinderen"];
const TABS: Category[] = ["Alles", "Werk & PBM", "Kleding", "Werkdag", "Cadeaus"];

type PriceBucket = "Alle" | "onder15" | "15-30" | "vanaf30";
const inPriceBucket = (price: number, bucket: PriceBucket): boolean => {
  if (bucket === "Alle") return true;
  if (bucket === "onder15") return price < 15;
  if (bucket === "15-30") return price >= 15 && price <= 30;
  return price > 30;
};
type SortOrder = "relevantie" | "prijs-op" | "prijs-af" | "naam";

const PILL = "rounded-full border px-4 py-2 text-[12px] font-medium transition";
const pill = (on: boolean) => `${PILL} ${on ? "border-lux-ink bg-lux-ink text-white" : "border-lux-line text-lux-ink hover:border-lux-ink"}`;

export function ShopStorefront({
  initialCat = "Alles",
  initialQuery = "",
  products,
}: {
  initialCat?: Category;
  initialQuery?: string;
  /** Actieve producten van de server, zodat de eerste HTML (en Google) de echte catalogus toont. */
  products: ShopCardProduct[];
}) {
  const t = useT();
  // dezelfde namen als het menu en de categorievakken ("Cadeaus" heet daar "Voor teams")
  const TAB_LABEL: Record<Category, string> = { Alles: t.shop.all, "Werk & PBM": t.shop.navPbm, Kleding: t.shop.navKleding, Werkdag: t.shop.navWerkdag, Cadeaus: t.shop.navTeams };
  const PRICE_LABEL: Record<PriceBucket, string> = { Alle: t.shop.allPrices, onder15: t.shop.under15, "15-30": t.shop.between1530, vanaf30: t.shop.from30 };
  const SORT_LABEL: Record<SortOrder, string> = { relevantie: t.shop.sortRelevance, "prijs-op": t.shop.sortPriceAsc, "prijs-af": t.shop.sortPriceDesc, naam: t.shop.sortName };
  const [category, setCategory] = useState<Category>(initialCat);
  const [gender, setGender] = useState<Gender>("Alle");
  const [query, setQuery] = useState(initialQuery);
  const [onlyWishlist, setOnlyWishlist] = useState(false);
  const [sizeFilter, setSizeFilter] = useState("Alle");
  const [colorFilter, setColorFilter] = useState("Alle");
  const [priceBucket, setPriceBucket] = useState<PriceBucket>("Alle");
  const [sort, setSort] = useState<SortOrder>("relevantie");
  const [panel, setPanel] = useState(false);
  const wishlist = useShopWishlist();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // links als /shop?cat=… of /shop?q=… (categorievakken, pakketten) zetten het raster opnieuw
  useEffect(() => setCategory(initialCat), [initialCat]);
  useEffect(() => setQuery(initialQuery), [initialQuery]);

  useEffect(() => {
    if (!panel) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  // De basisset vóór maat/kleur/prijs: daarop worden de filteropties berekend, zodat
  // een gekozen filter zijn eigen alternatieven niet uit de lijst laat verdwijnen.
  const facetScope = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === "Alles" || p.category === category) &&
        (gender === "Alle" || p.gender === GENDER_VALUE[gender]) &&
        (!onlyWishlist || wishlist.has(p.id)) &&
        (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    );
  }, [products, category, gender, query, onlyWishlist, wishlist]);

  const sizes = useMemo(() => [...new Set(facetScope.flatMap((p) => p.variants.map((v) => v.size).filter((s): s is string => Boolean(s))))].sort(bySize), [facetScope]);
  const colors = useMemo(() => [...new Set(facetScope.flatMap((p) => p.variants.map((v) => v.color).filter((c): c is string => Boolean(c))))], [facetScope]);
  useEffect(() => {
    if (sizeFilter !== "Alle" && !sizes.includes(sizeFilter)) setSizeFilter("Alle");
  }, [sizes, sizeFilter]);
  useEffect(() => {
    if (colorFilter !== "Alle" && !colors.includes(colorFilter)) setColorFilter("Alle");
  }, [colors, colorFilter]);

  const shown = useMemo(() => {
    const filtered = facetScope.filter(
      (p) =>
        (sizeFilter === "Alle" || p.variants.some((v) => v.size === sizeFilter)) &&
        (colorFilter === "Alle" || p.variants.some((v) => v.color === colorFilter)) &&
        inPriceBucket(p.price, priceBucket),
    );
    if (sort === "relevantie") return filtered;
    const sorted = [...filtered];
    if (sort === "prijs-op") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "prijs-af") sorted.sort((a, b) => b.price - a.price);
    else sorted.sort((a, b) => a.name.localeCompare(b.name, "nl"));
    return sorted;
  }, [facetScope, sizeFilter, colorFilter, priceBucket, sort]);

  const active = [gender !== "Alle", sizeFilter !== "Alle", colorFilter !== "Alle", priceBucket !== "Alle", sort !== "relevantie", onlyWishlist].filter(Boolean).length;
  const clearAll = () => {
    setGender("Alle");
    setSizeFilter("Alle");
    setColorFilter("Alle");
    setPriceBucket("Alle");
    setSort("relevantie");
    setOnlyWishlist(false);
  };

  return (
    <section id="collectie" className="scroll-mt-16 bg-white">
      <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="font-serif text-4xl text-lux-ink sm:text-5xl">{category === "Alles" ? t.shop.collection : TAB_LABEL[category]}</h2>
            <p className="mt-2 text-[13px] text-lux-mute">{fmt(t.shop.articles, { n: shown.length })}</p>
          </div>
          <label className="flex w-full items-center gap-2.5 border-b border-lux-line pb-2 sm:w-72">
            <IconSearch />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.shop.search} aria-label={t.shop.search} className="min-w-0 flex-1 bg-transparent text-[14px] text-lux-ink outline-none placeholder:text-lux-mute" />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t.shop.clearAll} className="text-lux-mute hover:text-lux-ink">
                ×
              </button>
            )}
          </label>
        </div>

        {/* blijft onder de kop staan tijdens scrollen */}
        <div className="sticky top-16 z-20 -mx-5 mt-8 flex items-center gap-4 border-y border-lux-line bg-white/90 px-5 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
          <nav aria-label={t.shop.collection} className="flex min-w-0 flex-1 gap-6 overflow-x-auto py-4 [scrollbar-width:none]">
            {TABS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`shrink-0 border-b pb-1 text-[12px] font-semibold uppercase tracking-[0.14em] transition ${category === c ? "border-lux-ink text-lux-ink" : "border-transparent text-lux-mute hover:text-lux-ink"}`}
              >
                {TAB_LABEL[c]}
              </button>
            ))}
          </nav>
          {/* op de telefoon staat er alleen een icoon: de naam moet er dan nog steeds zijn */}
          <button type="button" onClick={() => setPanel(true)} aria-label={active > 0 ? `${t.shop.filterSort} (${active})` : t.shop.filterSort} className="flex shrink-0 items-center gap-2 py-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-lux-ink">
            <IconSliders />
            <span className="hidden sm:inline">{t.shop.filterSort}</span>
            {active > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-lux-ink px-1 text-[10px] text-white">{active}</span>}
          </button>
        </div>

        {shown.length === 0 ? (
          <div className="py-24 text-center">
            <p className="font-serif text-2xl text-lux-ink">{onlyWishlist ? t.shop.noFavoritesFound : t.shop.noArticlesFound}</p>
            {(active > 0 || query) && (
              <button type="button" onClick={() => { clearAll(); setQuery(""); setCategory("Alles"); }} className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-lux-ink underline underline-offset-4">
                {t.shop.clearAll}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-y-16">
            {shown.map((p) => (
              <ShopProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>

      {panel && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t.shop.filterSort}>
          <button type="button" aria-label={t.shop.close} onClick={() => setPanel(false)} className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-white sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[420px] sm:rounded-none">
            <div className="flex items-center justify-between border-b border-lux-line px-6 py-5">
              <p className="font-serif text-2xl text-lux-ink">{t.shop.filterSort}</p>
              <button ref={closeRef} type="button" onClick={() => setPanel(false)} aria-label={t.shop.close} className="grid h-10 w-10 place-items-center rounded-full text-xl text-lux-ink hover:bg-lux-stone">
                ×
              </button>
            </div>
            <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
              {products.some((p) => p.gender) && (
                <FilterGroup title={t.shop.forWho}>
                  {GENDERS.map((g) => (
                    <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g} className={pill(gender === g)}>
                      {g === "Alle" ? t.shop.all : g}
                    </button>
                  ))}
                </FilterGroup>
              )}
              {sizes.length > 0 && (
                <FilterGroup title={t.shop.size}>
                  {["Alle", ...sizes].map((s) => (
                    <button key={s} type="button" onClick={() => setSizeFilter(s)} aria-pressed={sizeFilter === s} className={pill(sizeFilter === s)}>
                      {s === "Alle" ? t.shop.all : s}
                    </button>
                  ))}
                </FilterGroup>
              )}
              {colors.length > 0 && (
                <FilterGroup title={t.shop.color}>
                  {["Alle", ...colors].map((c) => (
                    <button key={c} type="button" onClick={() => setColorFilter(c)} aria-pressed={colorFilter === c} className={pill(colorFilter === c)}>
                      {c === "Alle" ? t.shop.all : c}
                    </button>
                  ))}
                </FilterGroup>
              )}
              <FilterGroup title={t.shop.price}>
                {(Object.keys(PRICE_LABEL) as PriceBucket[]).map((b) => (
                  <button key={b} type="button" onClick={() => setPriceBucket(b)} aria-pressed={priceBucket === b} className={pill(priceBucket === b)}>
                    {PRICE_LABEL[b]}
                  </button>
                ))}
              </FilterGroup>
              <FilterGroup title={t.shop.sort}>
                {(Object.keys(SORT_LABEL) as SortOrder[]).map((s) => (
                  <button key={s} type="button" onClick={() => setSort(s)} aria-pressed={sort === s} className={pill(sort === s)}>
                    {SORT_LABEL[s]}
                  </button>
                ))}
              </FilterGroup>
              <label className="flex items-center justify-between gap-4 border-t border-lux-line pt-6 text-[14px] text-lux-ink">
                {t.shop.onlyFavorites}
                {wishlist.count > 0 && <span className="text-[12px] text-lux-mute">({wishlist.count})</span>}
                <input type="checkbox" checked={onlyWishlist} onChange={(e) => setOnlyWishlist(e.target.checked)} className="ml-auto h-5 w-5 accent-lux-ink" />
              </label>
            </div>
            <div className="flex gap-3 border-t border-lux-line px-6 py-5">
              <button type="button" onClick={clearAll} className="flex-1 rounded-full border border-lux-line py-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-lux-ink hover:border-lux-ink">
                {t.shop.clearAll}
              </button>
              <button type="button" onClick={() => setPanel(false)} className="flex-[1.4] rounded-full bg-lux-ink py-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-white hover:bg-black">
                {fmt(t.shop.showResults, { n: shown.length })}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lux-mute">{title}</legend>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 text-lux-mute" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconSliders() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}
