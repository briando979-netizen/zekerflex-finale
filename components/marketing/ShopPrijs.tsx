"use client";

import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { useShopModus } from "@/components/marketing/ShopModus";
import { priceParts, shopMoney } from "@/components/marketing/shop-product";
import { btwTarief, prijsRegel } from "@/lib/shop/modus";

// De grote prijs op een kaart of productpagina. Particulier: incl. btw.
// Zakelijk: zonder btw, met eronder "€ x incl. btw".

export function ShopPrijs({ centen, product, groot = false }: { centen: number; product: { slug?: string | null | undefined; name?: string | null | undefined }; groot?: boolean }) {
  const t = useT();
  const { modus } = useShopModus();
  const r = prijsRegel(centen, modus, btwTarief(product));
  const [euros, cents] = priceParts(r.hoofd / 100);
  return (
    <>
      <p className="text-ink">
        <span className="sr-only">{`${shopMoney(r.hoofd / 100)}${r.exclusief ? ` ${t.shopZakelijk.exclBtw}` : ""}`}</span>
        <span aria-hidden className="flex items-start">
          <span className={`${groot ? "text-[34px]" : "text-[22px] sm:text-[24px]"} font-extrabold leading-none tracking-tight`}>{euros},</span>
          <span className={`${groot ? "text-[17px]" : "text-[13px]"} font-extrabold leading-none`}>{cents}</span>
          {r.exclusief && <span className={`ml-1.5 self-end font-semibold text-neutralx-500 ${groot ? "text-[13px]" : "text-[11px]"}`}>{t.shopZakelijk.exclBtwKort}</span>}
        </span>
      </p>
      {r.exclusief && <p className={`mt-0.5 text-neutralx-500 ${groot ? "text-[13px]" : "text-[11px]"}`}>{fmt(t.shopZakelijk.inclBtwBedrag, { bedrag: shopMoney(r.incl / 100) })}</p>}
    </>
  );
}
