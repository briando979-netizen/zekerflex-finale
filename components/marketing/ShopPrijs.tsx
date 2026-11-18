"use client";

import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { useShopModus } from "@/components/marketing/ShopModus";
import { priceParts, shopMoney } from "@/components/marketing/shop-product";
import { btwTarief, prijsRegel } from "@/lib/shop/modus";
import { kortingProcent } from "@/lib/shop/aanbieding";

// De grote prijs op een kaart of productpagina. Particulier: incl. btw.
// Zakelijk: zonder btw, met eronder "€ x incl. btw".
// Aanbieding (`vanCenten`, lib/shop/aanbieding.ts): de "van"-prijs doorgestreept met het percentage erbij. Die prijs is
// de laagste van de 30 dagen vóór de aanbieding; op de productpagina (`groot`) staat dat er in woorden onder.

export function ShopPrijs({ centen, product, groot = false, vanCenten = null }: { centen: number; product: { slug?: string | null | undefined; name?: string | null | undefined }; groot?: boolean; vanCenten?: number | null }) {
  const t = useT();
  const { modus } = useShopModus();
  const r = prijsRegel(centen, modus, btwTarief(product));
  const [euros, cents] = priceParts(r.hoofd / 100);
  const van = typeof vanCenten === "number" && vanCenten > centen ? prijsRegel(vanCenten, modus, btwTarief(product)).hoofd : null;
  const procent = van !== null && typeof vanCenten === "number" ? kortingProcent(vanCenten, centen) : 0;
  return (
    <>
      {van !== null && procent > 0 && (
        <p className={`mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 ${groot ? "text-[14px]" : "text-[12px]"}`}>
          <span className="rounded bg-crit px-1.5 py-0.5 font-bold leading-none text-white">-{procent}%</span>
          <span className="text-neutralx-500">
            <span className="sr-only">{t.shop.dealVan} </span>
            <s>{shopMoney(van / 100)}</s>
          </span>
        </p>
      )}
      {/* relative: de sr-only-tekst (absoluut) blijft binnen een vegende rij, anders rekt hij de pagina op */}
      <p className="relative text-ink">
        <span className="sr-only">{`${shopMoney(r.hoofd / 100)}${r.exclusief ? ` ${t.shopZakelijk.exclBtw}` : ""}`}</span>
        <span aria-hidden className="flex items-start">
          <span className={`${groot ? "text-[34px]" : "text-[22px] sm:text-[24px]"} font-extrabold leading-none tracking-tight`}>{euros},</span>
          <span className={`${groot ? "text-[17px]" : "text-[13px]"} font-extrabold leading-none`}>{cents}</span>
          {r.exclusief && <span className={`ml-1.5 self-end font-semibold text-neutralx-500 ${groot ? "text-[13px]" : "text-[11px]"}`}>{t.shopZakelijk.exclBtwKort}</span>}
        </span>
      </p>
      {r.exclusief && <p className={`mt-0.5 text-neutralx-500 ${groot ? "text-[13px]" : "text-[11px]"}`}>{fmt(t.shopZakelijk.inclBtwBedrag, { bedrag: shopMoney(r.incl / 100) })}</p>}
      {groot && van !== null && procent > 0 && <p className="mt-1 text-[12px] text-neutralx-500">{fmt(t.shop.dealLaagste, { bedrag: shopMoney(van / 100) })}</p>}
    </>
  );
}
