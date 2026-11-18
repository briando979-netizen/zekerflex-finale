"use client";

import { Fragment, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useShopCart } from "@/components/marketing/useShopCart";
import { CART_OPEN_EVENT } from "@/components/marketing/ShopChrome";
import { IconCart } from "@/components/marketing/ShopProductCard";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

// "Vaak samen gekocht" als koopset (zoals bol.com): de foto's met + ertussen, een
// totaalprijs en één knop om de aangevinkte artikelen samen in de winkelwagen te
// leggen. Alleen artikelen met één variant staan erbij (die kun je in één klik
// toevoegen); een artikel met maten/kleuren kies je op zijn eigen pagina. Het
// hoofdartikel (deze pagina) staat vast aangevinkt met zijn gekozen maat.

export type SamenItem = { variantId: string; slug: string; name: string; imageUrl: string | null; priceCents: number };

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const H2 = "font-display text-[20px] font-bold tracking-tight text-ink sm:text-[22px]";

export function SamenGekochtBundel({
  titel,
  hoofd,
  companions,
}: {
  titel: string;
  /** het artikel van deze pagina; variantId is null als er nog geen maat gekozen is */
  hoofd: { name: string; slug: string; imageUrl: string | null; variantId: string | null; priceCents: number };
  companions: SamenItem[];
}) {
  const t = useT();
  const { add, count } = useShopCart();
  const [gekozen, setGekozen] = useState<Set<string>>(() => new Set(companions.map((c) => c.variantId)));
  const [added, setAdded] = useState(false);

  const gekozenItems = companions.filter((c) => gekozen.has(c.variantId));
  const aantal = (hoofd.variantId ? 1 : 0) + gekozenItems.length;
  const totaal = (hoofd.variantId ? hoofd.priceCents : 0) + gekozenItems.reduce((s, c) => s + c.priceCents, 0);
  const canAdd = Boolean(hoofd.variantId) && aantal > 0;

  const thumbs = useMemo(
    () => [{ key: "hoofd", slug: hoofd.slug, name: hoofd.name, imageUrl: hoofd.imageUrl, aan: true }, ...companions.map((c) => ({ key: c.variantId, slug: c.slug, name: c.name, imageUrl: c.imageUrl, aan: gekozen.has(c.variantId) }))],
    [hoofd, companions, gekozen],
  );

  function toggle(variantId: string) {
    setAdded(false);
    setGekozen((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  function voegToe() {
    if (!canAdd) return;
    if (hoofd.variantId) add(hoofd.variantId);
    for (const c of gekozenItems) add(c.variantId);
    setAdded(true);
    window.dispatchEvent(new Event(CART_OPEN_EVENT));
  }

  return (
    <section aria-labelledby="samen-kop" className="mt-12 border-t border-hair pt-10">
      <h2 id="samen-kop" className={H2}>
        {titel}
      </h2>
      <div className="mt-5 rounded-xl border border-hair p-5 lg:flex lg:items-center lg:gap-8">
        {/* foto's met + ertussen en = totaal */}
        <div className="flex flex-wrap items-center gap-3">
          {thumbs.map((it, i) => (
            <Fragment key={it.key}>
              {i > 0 && (
                <span aria-hidden className="text-[22px] font-light text-neutralx-400">
                  +
                </span>
              )}
              <Link
                href={`/shop/${it.slug}`}
                aria-label={it.name}
                className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border transition ${it.aan ? "border-brand-500" : "border-hair opacity-40"}`}
              >
                {it.imageUrl ? <Image src={it.imageUrl} alt="" fill sizes="80px" className="object-cover" /> : <ProductPlaceholder name={it.name} slug={it.slug} glyphSize={28} className="text-neutralx-300" />}
              </Link>
            </Fragment>
          ))}
          <span aria-hidden className="text-[22px] font-light text-neutralx-400">
            =
          </span>
          <span className="text-[20px] font-extrabold text-ink">{money(totaal)}</span>
        </div>

        {/* lijst met vinkjes + knop */}
        <div className="mt-5 lg:mt-0 lg:flex-1">
          <ul className="space-y-2">
            <li className="flex items-center gap-2.5 text-[14px]">
              <input type="checkbox" checked disabled aria-label={`${t.shop.samenDitArtikel}: ${hoofd.name}`} className="h-4 w-4 shrink-0 accent-[#0b3d2e]" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-ink">{t.shop.samenDitArtikel}:</span> <span className="text-neutralx-700">{hoofd.name}</span>
              </span>
              <span className="shrink-0 font-semibold text-ink">{money(hoofd.priceCents)}</span>
            </li>
            {companions.map((c) => (
              <li key={c.variantId} className="flex items-center gap-2.5 text-[14px]">
                <input id={`samen-${c.variantId}`} type="checkbox" checked={gekozen.has(c.variantId)} onChange={() => toggle(c.variantId)} className="h-4 w-4 shrink-0 accent-[#0b3d2e]" />
                <label htmlFor={`samen-${c.variantId}`} className="min-w-0 flex-1 cursor-pointer truncate text-neutralx-700">
                  <Link href={`/shop/${c.slug}`} className="hover:underline">
                    {c.name}
                  </Link>
                </label>
                <span className="shrink-0 font-semibold text-ink">{money(c.priceCents)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[14px]">
              <span className="text-neutralx-600">{t.shop.samenTotaal}: </span>
              <span className="text-[18px] font-extrabold text-ink">{money(totaal)}</span>
            </p>
            <button
              type="button"
              onClick={voegToe}
              disabled={!canAdd}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-[14px] font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutralx-300"
            >
              <IconCart size={18} />
              {t.shop.samenKnop}
              {aantal > 0 ? ` (${aantal})` : ""}
            </button>
          </div>
          {!hoofd.variantId && <p className="mt-2 text-[13px] text-neutralx-600">{t.shop.samenKiesMaat}</p>}
          {added && (
            <p role="status" className="mt-2 text-[13px] text-ink">
              {fmt(t.shop.addedToCart, { n: count })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
