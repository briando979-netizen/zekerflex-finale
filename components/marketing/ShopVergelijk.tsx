"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { bySize, shopMoney, type ShopCardProduct } from "@/components/marketing/shop-product";
import { useShopCart } from "@/components/marketing/useShopCart";
import { leesVergelijk, useShopVergelijk } from "@/components/marketing/useShopVergelijk";
import { Sterren } from "@/components/marketing/Sterren";
import { cijferTekst } from "@/lib/shop/beoordeling";
import { vergelijkPad, vergelijkRij, type VergelijkRij } from "@/lib/shop/vergelijk";
import { SELLER } from "@/components/marketing/ShopProductCard";

// Producten naast elkaar (lib/shop/vergelijk.ts), zoals bol.com: foto, prijs, beoordeling en alle kenmerken in één tabel,
// met "Alleen verschillen tonen". De keuze staat in het adres én in de browser (useShopVergelijk); die houden we gelijk.

export type VergelijkProduct = ShopCardProduct & { collection: string | null };

const WRAP = "mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8";

function laagstePrijs(p: ShopCardProduct): number {
  const prijzen = p.variants.map((v) => (v.priceCents ?? Math.round(p.price * 100)) / 100);
  return prijzen.length ? Math.min(...prijzen) : p.price;
}

function voorLabel(g: string | null | undefined, t: Dict): string {
  if (g === "heren") return t.shop.doelHeren;
  if (g === "vrouwen") return t.shop.doelVrouwen;
  if (g === "kinderen") return t.shop.doelKinderen;
  if (g === "unisex") return t.shop.doelUnisex;
  return "—";
}

function rijen(producten: VergelijkProduct[], t: Dict): VergelijkRij[] {
  const lijst = (p: VergelijkProduct, k: "size" | "color") => {
    const w = [...new Set(p.variants.map((v) => v[k]).filter((x): x is string => Boolean(x)))];
    return (k === "size" ? w.sort(bySize) : w).join(", ") || "—";
  };
  return [
    vergelijkRij("prijs", t.shop.vergelijkPrijs, producten.map((p) => shopMoney(laagstePrijs(p)))),
    vergelijkRij("beoordeling", t.shop.beoordelingen, producten.map((p) => (p.beoordeling ? `${cijferTekst(p.beoordeling.gemiddelde)} (${p.beoordeling.aantal})` : t.shop.beoordelingGeen))),
    vergelijkRij("categorie", t.shop.specCategorie, producten.map((p) => (p.category === "Cadeaus" ? t.shop.navTeams : p.category))),
    vergelijkRij("voor", t.shop.specDoelgroep, producten.map((p) => voorLabel(p.gender, t))),
    vergelijkRij("collectie", t.shop.specCollectie, producten.map((p) => p.collection ?? "—")),
    vergelijkRij("maten", t.shop.specMaten, producten.map((p) => lijst(p, "size"))),
    vergelijkRij("kleuren", t.shop.specKleuren, producten.map((p) => lijst(p, "color"))),
    vergelijkRij("verkoper", t.shop.specVerkoper, producten.map((p) => p.seller ?? SELLER)),
    vergelijkRij("voorraad", t.shop.vergelijkVoorraad, producten.map((p) => (p.variants.some((v) => v.stock > 0) ? t.shop.opVoorraad : t.shop.soldOut))),
  ];
}

export function ShopVergelijk({ producten, gevraagd }: { producten: VergelijkProduct[]; gevraagd: string[] }) {
  const t = useT();
  const router = useRouter();
  const keuze = useShopVergelijk();
  const { add } = useShopCart();
  const [verschillen, setVerschillen] = useState(false);
  const [toegevoegd, setToegevoegd] = useState<string | null>(null);

  // Het adres is leidend. Zonder ?ids= de eigen keuze uit de browser laden; met ?ids= (ook een gedeelde link) die bewaren.
  // Alleen bij een ander adres, en de browser direct gelezen: anders zet de oude keuze een net weggehaald product terug.
  const uitAdres = gevraagd.join(",");
  const { zet } = keuze;
  useEffect(() => {
    const opgeslagen = leesVergelijk();
    if (!uitAdres) {
      if (opgeslagen.length) router.replace(vergelijkPad(opgeslagen));
    } else if (uitAdres !== opgeslagen.join(",")) zet(uitAdres.split(","));
  }, [uitAdres, zet, router]);

  const alleRijen = useMemo(() => rijen(producten, t), [producten, t]);
  const getoond = verschillen && producten.length > 1 ? alleRijen.filter((r) => r.verschilt) : alleRijen;

  const weg = (id: string) => {
    const nieuw = gevraagd.filter((x) => x !== id);
    keuze.zet(nieuw);
    router.replace(vergelijkPad(nieuw));
  };
  const wis = () => {
    keuze.zet([]);
    router.replace(vergelijkPad([]));
  };

  return (
    <div className={`${WRAP} py-8 sm:py-10`}>
      <h1 className="font-display text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">{t.shop.vergelijkTitel}</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-neutralx-600">{t.shop.vergelijkUitleg}</p>

      {producten.length === 0 ? (
        <div className="mt-8 rounded-xl border border-hair bg-paper-soft p-6">
          <p className="text-[15px] font-semibold text-ink">{t.shop.vergelijkLeeg}</p>
          <Link href="/shop#collectie" className="mt-4 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-[14px] font-bold text-white">
            {t.shop.vergelijkNaarShop}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink">
              <input type="checkbox" checked={verschillen} onChange={(e) => setVerschillen(e.target.checked)} className="h-4 w-4 accent-[#0b3d2e]" />
              {t.shop.vergelijkVerschillen}
            </label>
            <div className="flex items-center gap-4 text-[14px]">
              <Link href="/shop#collectie" className="font-semibold text-brand-600 hover:underline">
                {t.shop.vergelijkNaarShop}
              </Link>
              <button type="button" onClick={wis} className="font-semibold text-neutralx-600 hover:underline">
                {t.shop.vergelijkWissen}
              </button>
            </div>
          </div>

          <div className="relative mt-4 overflow-x-auto rounded-xl border border-hair">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className="align-top">
                  <th scope="col" className="w-40 bg-paper-soft px-4 py-3 text-left text-[13px] font-semibold text-neutralx-600">
                    <span className="sr-only">{t.shop.vergelijkTitel}</span>
                  </th>
                  {producten.map((p) => {
                    const enkel = p.variants.length <= 1 ? p.variants[0] : null;
                    const href = p.slug ? `/shop/${p.slug}` : "/shop";
                    return (
                      <th key={p.id} scope="col" className="min-w-[180px] px-4 py-3 text-left font-normal">
                        <div className="relative aspect-square w-full max-w-[200px] overflow-hidden rounded-lg bg-paper-soft">
                          {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="200px" className="object-cover" />}
                        </div>
                        <Link href={href} className="mt-2 line-clamp-2 block text-[15px] font-semibold text-ink hover:underline">
                          {p.name}
                        </Link>
                        {p.beoordeling && (
                          <p className="mt-1">
                            <Sterren gemiddelde={p.beoordeling.gemiddelde} grootte={13} label={fmt(t.shop.sterrenVan5, { cijfer: cijferTekst(p.beoordeling.gemiddelde) })} />
                          </p>
                        )}
                        <div className="mt-3 flex flex-col gap-2">
                          {enkel && enkel.stock > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                add(enkel.id);
                                setToegevoegd(p.id);
                              }}
                              className="h-10 rounded-lg bg-brand-500 px-3 text-[13px] font-bold text-white"
                            >
                              {toegevoegd === p.id ? `✓ ${t.shop.addToCart}` : t.shop.addToCart}
                            </button>
                          ) : (
                            <Link href={href} className="inline-flex h-10 items-center justify-center rounded-lg border border-hairstrong px-3 text-[13px] font-semibold text-ink hover:bg-paper-soft">
                              {t.shop.vergelijkKiesMaat}
                            </Link>
                          )}
                          <button type="button" onClick={() => weg(p.id)} aria-label={fmt(t.shop.vergelijkWeg, { naam: p.name })} className="text-left text-[12px] font-semibold text-neutralx-600 hover:underline">
                            × {t.shop.vergelijkHaalWeg}
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {getoond.map((r, i) => (
                  <tr key={r.sleutel} className={`border-t border-hair ${i % 2 ? "bg-white" : "bg-paper-soft/60"}`}>
                    <th scope="row" className="px-4 py-3 text-left text-[13px] font-semibold text-neutralx-600">
                      {r.label}
                    </th>
                    {r.waarden.map((w, j) => (
                      <td key={producten[j]?.id ?? j} className={`px-4 py-3 text-ink ${r.sleutel === "prijs" ? "text-[16px] font-extrabold" : ""}`}>
                        {w}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {verschillen && getoond.length === 0 && <p className="mt-4 text-[14px] text-neutralx-600">{t.shop.vergelijkGeenVerschil}</p>}
        </>
      )}
    </div>
  );
}
