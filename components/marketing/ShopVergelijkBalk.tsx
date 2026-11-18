"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { vergelijkPad } from "@/lib/shop/vergelijk";

// De zwevende vergelijkbalk (18 nov 2026, eigenaar: "de vergelijk-knop kan je aanvinken maar er komt geen vervolg"). Zodra
// er één product is aangevinkt staat hij onderaan: de gekozen producten met een kruisje, Alles wissen en de knop naar de
// vergelijking (vanaf twee). Rechts blijft ruimte voor de chatknop; op een productpagina staat hij op de telefoon boven
// de koopbalk. Op de vergelijkpagina zelf is hij weg.

export interface BalkProduct {
  id: string;
  name: string;
  imageUrl?: string | null;
}

const EIGEN_PADEN = ["account", "vergelijk", "paskamer", "zakelijk", "voorraadmelding", "bestelling", "p"];

/** Is dit een productpagina (/shop/<slug>)? Daar staat op de telefoon een koopbalk onderaan. */
export function isProductPad(pad: string | null): boolean {
  const m = /^\/shop\/([^/]+)$/.exec(pad ?? "");
  return Boolean(m && !EIGEN_PADEN.includes(m[1] ?? ""));
}

export function ShopVergelijkBalk({ ids, catalog, t, onWeg, onWissen }: { ids: readonly string[]; catalog: readonly BalkProduct[]; t: Dict; onWeg: (id: string) => void; onWissen: () => void }) {
  const pad = usePathname();
  const n = ids.length;
  const opVergelijk = pad === "/shop/vergelijk";
  const gekozen = ids.map((id) => catalog.find((p) => p.id === id) ?? { id, name: "", imageUrl: null });
  return (
    <>
      {/* het aantal voor wie een schermlezer gebruikt, ook als de balk er (nog) niet staat */}
      <p className="sr-only" role="status" aria-live="polite">
        {n > 0 ? fmt(t.shop.vergelijkGekozen, { n }) : ""}
      </p>
      {n > 0 && !opVergelijk && (
        // het vak eromheen zet de balk op zijn plek (de animatie gebruikt zelf transform); klikken gaat er dwars doorheen
        <div
          className={`pointer-events-none fixed inset-x-0 z-40 flex pl-3 pr-[84px] sm:justify-center sm:px-[110px] ${isProductPad(pad) ? "bottom-[calc(96px+env(safe-area-inset-bottom))] lg:bottom-[calc(16px+env(safe-area-inset-bottom))]" : "bottom-[calc(12px+env(safe-area-inset-bottom))] sm:bottom-[calc(16px+env(safe-area-inset-bottom))]"}`}
        >
        <section aria-label={t.shop.vergelijkTitel} className="pointer-events-auto w-full rounded-2xl border border-hairstrong bg-white p-2.5 shadow-lift animate-fade-up sm:w-auto sm:max-w-[720px] sm:p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <ul className="flex min-w-0 flex-1 items-center gap-2">
              {gekozen.map((p) => (
                <li key={p.id} className="relative flex min-w-0 items-center gap-2 rounded-xl border border-hair bg-paper-soft p-1 pr-7 sm:max-w-[150px]">
                  <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white" aria-hidden>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="hidden min-w-0 truncate text-[12px] font-semibold text-ink sm:block">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => onWeg(p.id)}
                    aria-label={fmt(t.shop.vergelijkWeg, { naam: p.name || t.shop.vergelijk })}
                    className="absolute right-0.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[15px] leading-none text-neutralx-600 hover:bg-white hover:text-ink"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
              <button type="button" onClick={onWissen} className="text-[13px] font-semibold text-neutralx-600 underline underline-offset-2 hover:text-ink">
                {t.shop.vergelijkWissen}
              </button>
              {n >= 2 ? (
                <Link href={vergelijkPad([...ids])} className="inline-flex h-10 shrink-0 items-center rounded-lg bg-brand-500 px-4 text-[14px] font-bold text-white transition hover:bg-brand-600">
                  {fmt(t.shop.vergelijkNu, { n })} →
                </Link>
              ) : (
                <span className="inline-flex h-10 shrink-0 items-center rounded-lg bg-paper-200 px-4 text-[13px] font-semibold text-neutralx-700">{t.shop.vergelijkKiesNog}</span>
              )}
            </div>
          </div>
        </section>
        </div>
      )}
    </>
  );
}
