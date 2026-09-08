"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { useShopCart } from "@/components/marketing/useShopCart";
import { specFor } from "@/lib/shop/product-specs";

export type PdpProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  stock: number;
  imageUrl: string | null;
  modelPhotoUrl: string | null;
  badge: string | null;
};

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export function ProductDetail({ product, related }: { product: PdpProduct; related: PdpProduct[] }) {
  const { add, count } = useShopCart();
  const spec = useMemo(() => specFor(product.slug, product.description), [product]);
  const gallery = [product.imageUrl, product.modelPhotoUrl].filter(Boolean) as string[];
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const hasSize = Boolean(spec.sizeTable);

  return (
    <div className="shell py-8 md:py-12">
      <nav className="mb-6 flex items-center gap-2 text-xs text-neutralx-500">
        <Link href="/shop" className="hover:text-ink">Shop</Link>
        <span>/</span>
        <Link href={`/shop?cat=${encodeURIComponent(product.category)}`} className="hover:text-ink">{product.category}</Link>
        <span>/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* galerij */}
        <div>
          <div className="overflow-hidden rounded-2xl bg-paper-soft">
            {gallery.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gallery[active]} alt={product.name} className="aspect-square w-full object-cover" />
            ) : (
              <div className="grid aspect-square w-full place-items-center"><LogoGlyph size={96} tone="dark" /></div>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="mt-3 flex gap-3">
              {gallery.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`h-20 w-20 overflow-hidden rounded-lg border-2 transition ${i === active ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* info */}
        <div>
          {product.badge && (
            <span className="inline-block rounded bg-mintwash px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">{product.badge}</span>
          )}
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight">{product.name}</h1>
          <p className="mt-3 text-2xl font-bold">{money(product.priceCents)}</p>
          <p className="mt-1 text-xs text-neutralx-500">Incl. btw · gratis verzending vanaf € 50</p>
          {spec.fit && <p className="mt-4 text-sm text-neutralx-600"><span className="font-semibold text-ink">Pasvorm:</span> {spec.fit}</p>}

          <div className="mt-6 flex items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-hairstrong">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3.5 py-2 text-lg">−</button>
              <span className="min-w-8 text-center text-sm font-semibold">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} className="px-3.5 py-2 text-lg">+</button>
            </div>
            <button
              type="button"
              onClick={() => { add(product.id, qty); setAdded(true); }}
              disabled={product.stock <= 0}
              className="flex-1 rounded-lg bg-ink py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-40"
            >
              {product.stock <= 0 ? "Uitverkocht" : "In winkelwagen"}
            </button>
          </div>
          {added && (
            <p className="mt-3 text-sm font-semibold text-brand-600">
              Toegevoegd — {count} in je winkelwagen.{" "}
              <Link href="/shop" className="underline">Verder winkelen</Link>
            </p>
          )}
          <p className="mt-2 text-xs text-neutralx-400">
            {product.stock > 0 ? `${product.stock} op voorraad · voor 22:00 besteld, morgen in huis` : "Tijdelijk niet leverbaar"}
          </p>

          {/* productomschrijving */}
          <div className="mt-8 border-t border-hair pt-6">
            <h2 className="font-display text-lg font-bold">Productomschrijving</h2>
            <ul className="mt-3 space-y-2 text-sm text-neutralx-600">
              {spec.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-neutralx-400" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* maattabel */}
          {hasSize && spec.sizeTable && (
            <div className="mt-4 border-t border-hair pt-6">
              <button type="button" onClick={() => setSizeOpen((o) => !o)} className="flex w-full items-center justify-between font-display text-lg font-bold">
                Maattabel
                <span className="text-base font-normal text-neutralx-400">{sizeOpen ? "−" : "+"}</span>
              </button>
              {sizeOpen && (
                <div className="mt-4">
                  <p className="text-xs text-neutralx-500">{spec.sizeTable.note}</p>
                  {spec.sizeTable.legend && (
                    <ul className="mt-2 text-xs text-neutralx-500">
                      {spec.sizeTable.legend.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  )}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-hairstrong text-left">
                          {spec.sizeTable.columns.map((c) => (
                            <th key={c} className="py-2 pr-4 font-semibold">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {spec.sizeTable.rows.map((row) => (
                          <tr key={String(row[0])} className="border-b border-hair">
                            {row.map((cell, ci) => (
                              <td key={ci} className={`py-2 pr-4 ${ci === 0 ? "font-semibold" : "text-neutralx-600"}`}>
                                {typeof cell === "number" ? cell.toFixed(1) : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* gerelateerd */}
      {related.length > 0 && (
        <div className="mt-16 border-t border-hair pt-10">
          <h2 className="font-display text-xl font-bold">Anderen bekeken ook</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {related.map((r) => (
              <Link key={r.id} href={`/shop/${r.slug}`} className="group">
                <div className="aspect-[4/5] overflow-hidden rounded-xl bg-paper-soft">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full place-items-center"><LogoGlyph size={56} tone="dark" /></div>
                  )}
                </div>
                <h3 className="mt-2 text-sm font-semibold leading-snug">{r.name}</h3>
                <p className="mt-0.5 text-sm font-bold">{money(r.priceCents)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
