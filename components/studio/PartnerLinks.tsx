"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Card, ICheck, ISearch, input } from "@/components/studio/ui";

// Studio → Verdienen: je eigen partnerlink en een link per product, om te
// kopiëren. De links gaan via /shop/p/<code> (telt de klik, geen cookies).

type Product = { slug: string; name: string; priceCents: number; imageUrl: string | null; category: string };

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export function PartnerLinks({ base, code, pct, producten }: { base: string; code: string; pct: number; producten: Product[] }) {
  const [zoek, setZoek] = useState("");
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);
  const shopLink = `${base}/shop/p/${code}`;
  const lijst = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return (q ? producten.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) : producten).slice(0, 40);
  }, [producten, zoek]);

  const kopieer = async (tekst: string, wat: string) => {
    try {
      await navigator.clipboard.writeText(tekst);
    } catch {
      // zonder klembord (oude browser, geen https): laat de link zien om zelf te kopiëren
      window.prompt("Kopieer deze link:", tekst);
    }
    setGekopieerd(wat);
    setTimeout(() => setGekopieerd((g) => (g === wat ? null : g)), 2000);
  };

  return (
    <Card title="Jouw links">
      <label htmlFor="partner-shoplink" className="text-xs font-semibold text-[#616161]">
        Link naar de hele webshop
      </label>
      <div className="mt-1.5 flex gap-2">
        <input id="partner-shoplink" readOnly value={shopLink} onFocus={(e) => e.currentTarget.select()} className={`${input} font-mono text-xs`} />
        <button type="button" onClick={() => kopieer(shopLink, "shop")} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#1a1a1a] px-3.5 text-sm font-semibold text-white hover:bg-black">
          {gekopieerd === "shop" ? <ICheck /> : null}
          {gekopieerd === "shop" ? "Gekopieerd" : "Kopieer"}
        </button>
      </div>

      <div className="mt-5 border-t border-[#ebebeb] pt-4">
        <label htmlFor="partner-zoek" className="text-xs font-semibold text-[#616161]">
          Link naar één product
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#707070]">
            <ISearch />
          </span>
          <input id="partner-zoek" type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een product, bijvoorbeeld handschoenen" className={`${input} pl-9`} />
        </div>
        <ul className="mt-3 max-h-[420px] divide-y divide-[#f1f1f1] overflow-y-auto rounded-xl border border-[#ebebeb]">
          {lijst.length === 0 && <li className="px-4 py-6 text-center text-sm text-[#616161]">Geen product gevonden.</li>}
          {lijst.map((p) => {
            const link = `${shopLink}?naar=${encodeURIComponent(p.slug)}`;
            const vergoeding = Math.floor(((p.priceCents / 1.21) * pct) / 100);
            return (
              <li key={p.slug} className="flex items-center gap-3 px-3 py-2.5">
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#f1f1f1]">
                  {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="44px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#1a1a1a]">{p.name}</span>
                  <span className="block text-xs text-[#616161]">
                    {euro(p.priceCents)} · jij krijgt {euro(vergoeding)} per stuk
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => kopieer(link, p.slug)}
                  aria-label={`Kopieer de link naar ${p.name}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#d4d4d4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#303030] hover:bg-[#f7f7f7]"
                >
                  {gekopieerd === p.slug ? "Gekopieerd" : "Kopieer link"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p role="status" className="sr-only">
        {gekopieerd ? "Link gekopieerd" : ""}
      </p>
    </Card>
  );
}
