"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { ShopProductCard } from "@/components/marketing/ShopProductCard";
import { bySize, type ShopCardProduct, type ShopCategory } from "@/components/marketing/shop-product";

// Het assortiment op de shop-homepage, opgebouwd als een marktplaats: filters
// links (op de telefoon in een uitschuifvenster), erboven het aantal resultaten
// en sorteren, en de gekozen filters als chips om weg te klikken. Zoeken gaat via
// de zoekbalk in de kop (/shop?q=…); de producten komen van de server.

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
const inStock = (p: ShopCardProduct) => p.variants.some((v) => v.stock > 0);

export function ShopStorefront({
  initialCat = "Alles",
  initialQuery = "",
  products,
  pageTitle = false,
}: {
  initialCat?: Category;
  initialQuery?: string;
  /** zonder banner (zoeken, een categorie) is de kop van het assortiment de paginatitel (h1) */
  pageTitle?: boolean;
  /** Actieve producten van de server, zodat de eerste HTML (en Google) de echte catalogus toont. */
  products: ShopCardProduct[];
}) {
  const t = useT();
  const labels = useLabels(t);
  const [category, setCategory] = useState<Category>(initialCat);
  const [gender, setGender] = useState<Gender>("Alle");
  const [query, setQuery] = useState(initialQuery);
  const [onlyWishlist, setOnlyWishlist] = useState(false);
  const [onlyStock, setOnlyStock] = useState(false);
  const [sizeFilter, setSizeFilter] = useState("Alle");
  const [colorFilter, setColorFilter] = useState("Alle");
  const [priceBucket, setPriceBucket] = useState<PriceBucket>("Alle");
  const [sort, setSort] = useState<SortOrder>("relevantie");
  const [panel, setPanel] = useState(false);
  const wishlist = useShopWishlist();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // links als /shop?cat=… of /shop?q=… (zoekbalk, categorievakken) zetten het raster opnieuw
  useEffect(() => setCategory(initialCat), [initialCat]);
  useEffect(() => setQuery(initialQuery), [initialQuery]);

  useEffect(() => {
    if (!panel) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  // zoeken, favorieten en voorraad: de basis voor de aantallen per categorie
  const baseScope = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!onlyWishlist || wishlist.has(p.id)) &&
        (!onlyStock || inStock(p)) &&
        (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    );
  }, [products, query, onlyWishlist, onlyStock, wishlist]);

  const catCounts = useMemo(() => {
    const m = new Map<Category, number>([["Alles", baseScope.length]]);
    for (const p of baseScope) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [baseScope]);

  // vóór maat/kleur/prijs: daarop worden die opties berekend, zodat een gekozen
  // filter zijn eigen alternatieven niet uit de lijst laat verdwijnen
  const facetScope = useMemo(
    () => baseScope.filter((p) => (category === "Alles" || p.category === category) && (gender === "Alle" || p.gender === GENDER_VALUE[gender])),
    [baseScope, category, gender],
  );
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

  const chips: { key: string; label: string; clear: () => void }[] = [
    ...(query ? [{ key: "q", label: `“${query}”`, clear: () => setQuery("") }] : []),
    ...(category !== "Alles" ? [{ key: "cat", label: labels.tab[category], clear: () => setCategory("Alles") }] : []),
    ...(gender !== "Alle" ? [{ key: "g", label: gender, clear: () => setGender("Alle") }] : []),
    ...(sizeFilter !== "Alle" ? [{ key: "s", label: `${t.shop.size} ${sizeFilter}`, clear: () => setSizeFilter("Alle") }] : []),
    ...(colorFilter !== "Alle" ? [{ key: "c", label: colorFilter, clear: () => setColorFilter("Alle") }] : []),
    ...(priceBucket !== "Alle" ? [{ key: "p", label: labels.price[priceBucket], clear: () => setPriceBucket("Alle") }] : []),
    ...(onlyStock ? [{ key: "v", label: t.shop.inStockOnly, clear: () => setOnlyStock(false) }] : []),
    ...(onlyWishlist ? [{ key: "f", label: t.shop.onlyFavorites, clear: () => setOnlyWishlist(false) }] : []),
  ];
  const clearAll = () => {
    setQuery("");
    setCategory("Alles");
    setGender("Alle");
    setSizeFilter("Alle");
    setColorFilter("Alle");
    setPriceBucket("Alle");
    setSort("relevantie");
    setOnlyWishlist(false);
    setOnlyStock(false);
  };

  const panelProps: FilterPanelProps = {
    t,
    labels,
    category,
    setCategory,
    catCounts,
    showGender: products.some((p) => p.gender),
    gender,
    setGender,
    sizes,
    sizeFilter,
    setSizeFilter,
    colors,
    colorFilter,
    setColorFilter,
    priceBucket,
    setPriceBucket,
    onlyStock,
    setOnlyStock,
    onlyWishlist,
    setOnlyWishlist,
    wishlistCount: wishlist.count,
  };
  const heading = query ? `“${query}”` : category === "Alles" ? t.shop.collection : labels.tab[category];
  const Heading = pageTitle ? "h1" : "h2";

  return (
    <section id="collectie" aria-labelledby="shop-assortiment" className="scroll-mt-32 bg-white lg:scroll-mt-20">
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-10">
        <aside aria-label={t.shop.filter} className="hidden lg:block">
          <div className="sticky top-[96px] max-h-[calc(100vh-112px)] overflow-y-auto pb-6 pr-2 [scrollbar-width:thin]">
            <FilterPanel {...panelProps} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-hair pb-4">
            <div className="min-w-0">
              <Heading id="shop-assortiment" className="truncate font-display text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">
                {heading}
              </Heading>
              <p className="mt-0.5 text-[13px] text-neutralx-500">{fmt(t.shop.results, { n: shown.length })}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPanel(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-hairstrong px-3.5 text-[13px] font-semibold text-ink lg:hidden"
              >
                <IconSliders />
                {t.shop.filter}
                {chips.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[11px] text-white">{chips.length}</span>}
              </button>
              <label className="flex items-center gap-2 text-[13px] text-neutralx-600">
                <span className="hidden sm:inline">{t.shop.sortBy}</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOrder)}
                  aria-label={t.shop.sortBy}
                  className="h-10 rounded-lg border border-hairstrong bg-white px-3 text-[13px] font-semibold text-ink"
                >
                  {(Object.keys(labels.sort) as SortOrder[]).map((s) => (
                    <option key={s} value={s}>
                      {labels.sort[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* telefoon en tablet: categorieën als vegende rij */}
          <nav aria-label={t.shop.category} className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden">
            {TABS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`h-9 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition ${category === c ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong bg-white text-ink"}`}
              >
                {labels.tab[c]}
              </button>
            ))}
          </nav>

          {chips.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.clear}
                  aria-label={fmt(t.shop.removeFilter, { name: c.label })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-[12px] font-semibold text-brand-700 transition hover:bg-brand-100"
                >
                  {c.label} <span aria-hidden>×</span>
                </button>
              ))}
              <button type="button" onClick={clearAll} className="h-8 px-2 text-[12px] font-semibold text-brand-600 underline underline-offset-2">
                {t.shop.clearAll}
              </button>
            </div>
          )}

          {shown.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-[18px] font-semibold text-ink">{onlyWishlist ? t.shop.noFavoritesFound : t.shop.noArticlesFound}</p>
              {chips.length > 0 && (
                <button type="button" onClick={clearAll} className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand-500 px-5 text-[13px] font-bold text-white hover:bg-brand-600">
                  {t.shop.clearAll}
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {shown.map((p) => (
                <li key={p.id}>
                  <ShopProductCard p={p} titleLevel={pageTitle ? "h2" : "h3"} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {panel && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.shop.filter}>
          <button type="button" aria-label={t.shop.close} onClick={() => setPanel(false)} className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-2xl bg-white sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[400px] sm:rounded-none">
            <div className="flex items-center justify-between border-b border-hair px-5 py-4">
              <p className="text-[17px] font-bold text-ink">{t.shop.filter}</p>
              <button ref={closeRef} type="button" onClick={() => setPanel(false)} aria-label={t.shop.close} className="grid h-10 w-10 place-items-center rounded-full text-xl text-ink hover:bg-paper-soft">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <FilterPanel {...panelProps} />
            </div>
            <div className="flex gap-3 border-t border-hair px-5 py-4">
              <button type="button" onClick={clearAll} className="h-12 flex-1 rounded-lg border border-hairstrong text-[14px] font-semibold text-ink">
                {t.shop.clearAll}
              </button>
              <button type="button" onClick={() => setPanel(false)} className="h-12 flex-[1.4] rounded-lg bg-brand-500 text-[14px] font-bold text-white hover:bg-brand-600">
                {fmt(t.shop.showResults, { n: shown.length })}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type Labels = { tab: Record<Category, string>; price: Record<PriceBucket, string>; sort: Record<SortOrder, string> };

function useLabels(t: Dict): Labels {
  return useMemo(
    () => ({
      // dezelfde namen als het menu ("Cadeaus" heet daar "Voor teams")
      tab: { Alles: t.shop.allCategories, "Werk & PBM": t.shop.navPbm, Kleding: t.shop.navKleding, Werkdag: t.shop.navWerkdag, Cadeaus: t.shop.navTeams },
      price: { Alle: t.shop.allPrices, onder15: t.shop.under15, "15-30": t.shop.between1530, vanaf30: t.shop.from30 },
      sort: { relevantie: t.shop.sortRelevance, "prijs-op": t.shop.sortPriceAsc, "prijs-af": t.shop.sortPriceDesc, naam: t.shop.sortName },
    }),
    [t],
  );
}

type FilterPanelProps = {
  t: Dict;
  labels: Labels;
  category: Category;
  setCategory: (c: Category) => void;
  catCounts: Map<Category, number>;
  showGender: boolean;
  gender: Gender;
  setGender: (g: Gender) => void;
  sizes: string[];
  sizeFilter: string;
  setSizeFilter: (s: string) => void;
  colors: string[];
  colorFilter: string;
  setColorFilter: (c: string) => void;
  priceBucket: PriceBucket;
  setPriceBucket: (b: PriceBucket) => void;
  onlyStock: boolean;
  setOnlyStock: (v: boolean) => void;
  onlyWishlist: boolean;
  setOnlyWishlist: (v: boolean) => void;
  wishlistCount: number;
};

const CHIP = "min-w-10 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition";
const chip = (on: boolean) => `${CHIP} ${on ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong bg-white text-ink hover:border-brand-500"}`;

/** De filters: links naast het raster op een computer, in het uitschuifvenster op de telefoon. */
function FilterPanel(f: FilterPanelProps) {
  const { t } = f;
  return (
    <div className="space-y-7">
      <FilterGroup title={t.shop.category}>
        <ul className="-mx-2 space-y-0.5">
          {TABS.map((c) => {
            const n = f.catCounts.get(c) ?? 0;
            const on = f.category === c;
            return (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => f.setCategory(c)}
                  aria-pressed={on}
                  disabled={n === 0 && !on}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[14px] transition disabled:opacity-40 ${on ? "bg-brand-50 font-bold text-brand-700" : "text-ink hover:bg-paper-soft"}`}
                >
                  <span>{f.labels.tab[c]}</span>
                  <span className="text-[12px] text-neutralx-500">{n}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </FilterGroup>

      {f.showGender && (
        <FilterGroup title={t.shop.forWho}>
          <div className="flex flex-wrap gap-1.5">
            {GENDERS.map((g) => (
              <button key={g} type="button" onClick={() => f.setGender(g)} aria-pressed={f.gender === g} className={chip(f.gender === g)}>
                {g === "Alle" ? t.shop.all : g}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}

      {f.sizes.length > 0 && (
        <FilterGroup title={t.shop.size}>
          <div className="flex flex-wrap gap-1.5">
            {["Alle", ...f.sizes].map((s) => (
              <button key={s} type="button" onClick={() => f.setSizeFilter(s)} aria-pressed={f.sizeFilter === s} className={chip(f.sizeFilter === s)}>
                {s === "Alle" ? t.shop.all : s}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}

      {f.colors.length > 0 && (
        <FilterGroup title={t.shop.color}>
          <div className="flex flex-wrap gap-1.5">
            {["Alle", ...f.colors].map((c) => (
              <button key={c} type="button" onClick={() => f.setColorFilter(c)} aria-pressed={f.colorFilter === c} className={chip(f.colorFilter === c)}>
                {c === "Alle" ? t.shop.all : c}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}

      <FilterGroup title={t.shop.price}>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(f.labels.price) as PriceBucket[]).map((b) => (
            <button key={b} type="button" onClick={() => f.setPriceBucket(b)} aria-pressed={f.priceBucket === b} className={chip(f.priceBucket === b)}>
              {f.labels.price[b]}
            </button>
          ))}
        </div>
      </FilterGroup>

      <div className="space-y-3 border-t border-hair pt-5">
        <label className="flex cursor-pointer items-center gap-3 text-[14px] text-ink">
          <input type="checkbox" checked={f.onlyStock} onChange={(e) => f.setOnlyStock(e.target.checked)} className="h-[18px] w-[18px] accent-brand-500" />
          {t.shop.inStockOnly}
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-[14px] text-ink">
          <input type="checkbox" checked={f.onlyWishlist} onChange={(e) => f.setOnlyWishlist(e.target.checked)} className="h-[18px] w-[18px] accent-brand-500" />
          {t.shop.onlyFavorites}
          {f.wishlistCount > 0 && <span className="text-[12px] text-neutralx-500">({f.wishlistCount})</span>}
        </label>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

function IconSliders() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}
