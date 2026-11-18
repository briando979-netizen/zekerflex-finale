"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { SHOP_CATEGORIEEN, categorieNaam } from "@/lib/shop/categorieen";
import { categoriePad, menuGroep, type VoorWaarde } from "@/lib/shop/categoriemenu";
import { subgroepenVoor, typischEerst } from "@/lib/shop/subgroepen";

// Het grote categoriemenu van de shop (18 nov 2026). Op een breed scherm een paneel onder de categoriebalk: links de
// categorieën met een vierkant beeld, rechts de subgroepen van de categorie waar je op staat. Op de telefoon een lade
// waarin je doorklikt. Alles uit de echte catalogus: een categorie zonder producten staat er niet in, een subgroep zonder
// treffers ook niet (lib/shop/subgroepen.ts), en de beelden zijn foto's van onze eigen producten.

export interface MenuProduct {
  id: string;
  slug?: string | null;
  name: string;
  priceCents: number;
  imageUrl?: string | null;
  category?: string | null;
  gender?: string | null;
  description?: string | null;
}

const WRAP = "mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8";
const euro = (cent: number) => `€ ${(cent / 100).toFixed(2).replace(".", ",")}`;

/** De naam van een categorie in de taal van de shop (de vier oorspronkelijke hebben een eigen tekst). */
export function menuCatLabel(c: string, t: Dict): string {
  if (c === "Werk & PBM") return t.shop.navPbm;
  if (c === "Kleding") return t.shop.navKleding;
  if (c === "Werkdag") return t.shop.navWerkdag;
  if (c === "Cadeaus") return t.shopZakelijk.navCadeaus;
  return categorieNaam(c, t.shop.navKleding !== "Kleding");
}

const voorLabel = (v: VoorWaarde, t: Dict) => (v === "heren" ? t.shop.doelHeren : v === "vrouwen" ? t.shop.doelVrouwen : t.shop.doelKinderen);

/** Het vierkante beeld bij een categorie: een foto van een product uit die categorie, anders de eerste letter. */
function Beeld({ src, letter, groot = false }: { src: string | null; letter: string; groot?: boolean }) {
  const maat = groot ? "h-11 w-11" : "h-9 w-9";
  return (
    <span className={`relative grid ${maat} shrink-0 place-items-center overflow-hidden rounded-lg bg-paper-soft text-[14px] font-bold text-neutralx-500`} aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        letter
      )}
    </span>
  );
}

export function ShopCategorieMenu({
  open,
  onClose,
  top,
  catalog,
  aantallen,
  t,
  extra = [],
  kop,
  voet,
}: {
  open: boolean;
  onClose: () => void;
  /** onderkant van de categoriebalk (px vanaf de bovenkant van het scherm): daar begint het paneel */
  top: number;
  catalog: readonly MenuProduct[];
  /** aantal actieve producten per categorie, van de server (app/shop/layout.tsx); leeg = onbekend */
  aantallen: Readonly<Record<string, number>>;
  t: Dict;
  /** ingangen zonder categorie (zakelijk: pakketten, team, offerte) */
  extra?: readonly { label: string; href: string }[];
  /** alleen in de lade op de telefoon: boven en onder de categorieën */
  kop?: ReactNode;
  voet?: ReactNode;
}) {
  const engels = t.shop.navKleding !== "Kleding";
  // welke categorieën er zijn: uit de catalogus zodra die er is, anders de telling van de server, anders allemaal
  const cats = useMemo(() => {
    const tel = (c: string) => (catalog.length ? catalog.filter((p) => p.category === c).length : Object.hasOwn(aantallen, c) ? (aantallen[c] ?? 0) : 0);
    const bekend = catalog.length > 0 || Object.keys(aantallen).length > 0;
    return SHOP_CATEGORIEEN.map((c) => ({ cat: c as string, aantal: tel(c) })).filter((c) => !bekend || c.aantal > 0);
  }, [catalog, aantallen]);
  const beeld = useMemo(() => {
    const uit = new Map<string, string>();
    const gebruikt = new Set<string>();
    for (const c of cats) {
      const metFoto = typischEerst(catalog, c.cat).filter((p) => p.imageUrl);
      const keuze = metFoto.find((p) => !gebruikt.has(p.imageUrl as string)) ?? metFoto[0];
      if (keuze?.imageUrl) {
        uit.set(c.cat, keuze.imageUrl);
        gebruikt.add(keuze.imageUrl);
      }
    }
    return uit;
  }, [catalog, cats]);

  const [actief, setActief] = useState<string | null>(null);
  // telefoon: null = de lijst, anders de categorie waarin je bent doorgeklikt
  const [binnen, setBinnen] = useState<string | null>(null);
  useEffect(() => {
    if (!open) void setBinnen(null);
  }, [open]);
  const gekozen = actief && cats.some((c) => c.cat === actief) ? actief : (cats[0]?.cat ?? null);

  if (!open) return null;

  const inhoud = (cat: string, sluit: () => void, smal: boolean) => {
    const groep = menuGroep(catalog, cat);
    const subs = subgroepenVoor(catalog, cat);
    const naam = menuCatLabel(cat, t);
    const top4 = typischEerst(catalog, cat).filter((p) => p.imageUrl).slice(0, smal ? 0 : 4);
    const rij = smal ? "flex items-center justify-between border-b border-hair px-5 py-3.5 text-[15px] text-ink hover:bg-paper-soft" : "flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-[14px] text-ink hover:bg-paper-soft";
    return (
      <>
        <div className={smal ? "border-b border-hair px-5 py-4" : "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hair pb-4"}>
          {!smal && <p className="font-display text-[22px] font-bold tracking-tight text-ink">{naam}</p>}
          <Link href={categoriePad(cat)} onClick={sluit} className="text-[14px] font-bold text-brand-600 hover:underline">
            {fmt(t.shop.inCategorie, { cat: naam })}
            {groep.aantal > 0 && <span className="ml-1 font-normal text-neutralx-500">({groep.aantal})</span>} →
          </Link>
        </div>
        {catalog.length === 0 ? (
          <p className={smal ? "px-5 py-4 text-[14px] text-neutralx-500" : "pt-4 text-[14px] text-neutralx-500"} role="status">
            {t.shop.menuLaden}
          </p>
        ) : (
          <>
            {(subs.length > 0 || groep.voor.length > 0) && (
              <ul className={smal ? "" : "mt-3 grid grid-cols-2 gap-x-6 gap-y-0.5 xl:grid-cols-3"}>
                {subs.map((s) => (
                  <li key={s.zoek}>
                    <Link href={s.href} onClick={sluit} className={rij}>
                      <span className="font-semibold">{engels ? s.en : s.nl}</span>
                      <span className="text-[13px] text-neutralx-500">{s.aantal}</span>
                    </Link>
                  </li>
                ))}
                {groep.voor.map((v) => (
                  <li key={v.waarde}>
                    <Link href={categoriePad(cat, v.waarde)} onClick={sluit} className={rij}>
                      <span className="font-semibold">{voorLabel(v.waarde, t)}</span>
                      <span className="text-[13px] text-neutralx-500">{v.aantal}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {top4.length > 0 && (
              <div className="mt-5">
                <p className="text-[13px] font-bold uppercase tracking-wide text-neutralx-500">{fmt(t.shop.menuPopulair, { cat: naam })}</p>
                <ul className="mt-2 grid max-w-[620px] grid-cols-4 gap-3">
                  {top4.map((p) => (
                    <li key={p.id}>
                      <Link href={`/shop/${p.slug ?? p.id}`} onClick={sluit} className="group block">
                        <span className="relative block aspect-square overflow-hidden rounded-xl border border-hair bg-paper-soft">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.imageUrl as string} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" loading="lazy" />
                        </span>
                        <span className="mt-1.5 line-clamp-2 block text-[13px] font-semibold leading-snug text-ink group-hover:underline">{p.name}</span>
                        <span className="mt-0.5 block text-[13px] font-bold text-ink">{euro(p.priceCents)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t.shop.allCategories}>
      <button type="button" aria-label={t.shop.close} onClick={onClose} className="absolute inset-0 bg-black/45" />

      {/* breed scherm: het paneel onder de categoriebalk */}
      <div className="absolute inset-x-0 hidden lg:block" style={{ top }}>
        <div className={WRAP}>
          <div className="relative flex overflow-hidden rounded-b-2xl bg-white shadow-lift" style={{ maxHeight: `calc(100vh - ${top + 24}px)` }}>
            <nav aria-label={t.shop.allCategories} className="w-[310px] shrink-0 overflow-y-auto border-r border-hair bg-paper-soft py-2">
              <ul>
                {cats.map((c) => (
                  <li key={c.cat}>
                    <Link
                      href={categoriePad(c.cat)}
                      onClick={onClose}
                      onMouseEnter={() => setActief(c.cat)}
                      onFocus={() => setActief(c.cat)}
                      aria-current={gekozen === c.cat ? "true" : undefined}
                      className={`flex items-center gap-3 px-4 py-2 text-[15px] font-semibold text-ink ${gekozen === c.cat ? "bg-white" : "hover:bg-white/70"}`}
                    >
                      <Beeld src={beeld.get(c.cat) ?? null} letter={menuCatLabel(c.cat, t).slice(0, 1)} />
                      <span className="min-w-0 flex-1 truncate">{menuCatLabel(c.cat, t)}</span>
                      <span aria-hidden className={gekozen === c.cat ? "text-brand-600" : "text-neutralx-400"}>
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
                {extra.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} onClick={onClose} className="flex items-center gap-3 px-4 py-2.5 text-[15px] font-semibold text-ink hover:bg-white/70">
                      <span className="min-w-0 flex-1 truncate">{n.label}</span>
                      <span aria-hidden className="text-neutralx-400">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="min-w-0 flex-1 overflow-y-auto p-6 xl:p-8">{gekozen && inhoud(gekozen, onClose, false)}</div>
            <button type="button" onClick={onClose} aria-label={t.shop.close} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-xl text-neutralx-600 hover:bg-paper-soft">
              ×
            </button>
          </div>
        </div>
      </div>

      {/* telefoon: een lade waarin je doorklikt */}
      <aside className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white lg:hidden">
        <div className="flex h-14 shrink-0 items-center justify-between bg-brand-700 px-4 text-white">
          {binnen ? (
            <button type="button" onClick={() => setBinnen(null)} className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[16px] font-bold hover:bg-white/10">
              <span aria-hidden>‹</span>
              <span className="sr-only">{t.shop.menuTerug}: </span>
              {menuCatLabel(binnen, t)}
            </button>
          ) : (
            <span className="text-[16px] font-bold">{t.shop.allCategories}</span>
          )}
          <button type="button" onClick={onClose} aria-label={t.shop.close} className="grid h-10 w-10 place-items-center rounded-lg text-xl hover:bg-white/10">
            ×
          </button>
        </div>
        {binnen ? (
          <nav aria-label={menuCatLabel(binnen, t)} className="relative flex-1 overflow-y-auto">
            {inhoud(binnen, onClose, true)}
          </nav>
        ) : (
          <nav aria-label={t.shop.allCategories} className="relative flex-1 overflow-y-auto pb-2">
            {kop}
            <ul>
              {cats.map((c) => (
                <li key={c.cat} className="border-b border-hair">
                  <button type="button" onClick={() => setBinnen(c.cat)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-[15px] font-semibold text-ink hover:bg-paper-soft">
                    <Beeld src={beeld.get(c.cat) ?? null} letter={menuCatLabel(c.cat, t).slice(0, 1)} groot />
                    <span className="min-w-0 flex-1">
                      {menuCatLabel(c.cat, t)}
                      {c.aantal > 0 && <span className="ml-1.5 text-[13px] font-normal text-neutralx-500">({c.aantal})</span>}
                    </span>
                    <span aria-hidden>›</span>
                  </button>
                </li>
              ))}
              {extra.map((n) => (
                <li key={n.href} className="border-b border-hair">
                  <Link href={n.href} onClick={onClose} className="flex items-center justify-between px-5 py-3.5 text-[15px] font-semibold text-ink hover:bg-paper-soft">
                    {n.label} <span aria-hidden>›</span>
                  </Link>
                </li>
              ))}
            </ul>
            {voet}
          </nav>
        )}
      </aside>
    </div>
  );
}
