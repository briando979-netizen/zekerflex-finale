"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/lib/auth/actions";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { LogoGlyph } from "@/components/brand/Logo";

export type ShopAccountOrder = {
  id: string;
  status: "PENDING_PAYMENT" | "RECEIVED" | "CONFIRMED" | "SHIPPED" | "CANCELLED" | "PAYMENT_FAILED";
  totalCents: number;
  itemCount: number;
  createdAt: string;
};

type WishlistProduct = { id: string; slug?: string | null; name: string; priceCents: number; imageUrl: string | null };

const STATUS_LABEL: Record<ShopAccountOrder["status"], string> = {
  PENDING_PAYMENT: "Wacht op betaling",
  RECEIVED: "Betaald",
  CONFIRMED: "Bevestigd",
  SHIPPED: "Onderweg",
  CANCELLED: "Geannuleerd",
  PAYMENT_FAILED: "Betaling mislukt",
};

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export function ShopAccount({
  principal,
  orders,
}: {
  principal: { fullName: string; email: string } | null;
  orders: ShopAccountOrder[];
}) {
  const router = useRouter();
  const wishlist = useShopWishlist();
  const [products, setProducts] = useState<WishlistProduct[]>([]);
  const [lookupId, setLookupId] = useState("");

  useEffect(() => {
    if (wishlist.ids.length === 0) { setProducts([]); return; }
    fetch("/api/shop/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => setProducts((d.products ?? []).filter((p: WishlistProduct) => wishlist.ids.includes(p.id))))
      .catch(() => undefined);
  }, [wishlist.ids]);

  return (
    <div className="shell max-w-3xl py-12 md:py-16">
      <h1 className="font-display text-3xl font-bold">Mijn account</h1>

      {principal ? (
        <>
          <p className="mt-2 text-sm text-neutralx-600">
            Hoi <span className="font-semibold text-ink">{principal.fullName}</span> — {principal.email}
          </p>

          <section className="mt-8 rounded-2xl border border-hair p-6">
            <h2 className="font-display text-lg font-bold">Je bestellingen</h2>
            {orders.length === 0 ? (
              <p className="mt-2 text-sm text-neutralx-500">Je hebt nog niets besteld in de ZekerFlex Shop.</p>
            ) : (
              <ul className="mt-4 divide-y divide-hair">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/shop/bestelling/${o.id}`} className="flex items-center justify-between py-3 text-sm hover:text-brand-600">
                      <span>
                        <span className="font-semibold">{STATUS_LABEL[o.status]}</span>
                        <span className="ml-2 text-neutralx-400">{new Date(o.createdAt).toLocaleDateString("nl-NL")} · {o.itemCount} artikel(en)</span>
                      </span>
                      <span className="font-semibold">{money(o.totalCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard" className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold hover:border-ink">
              Naar het ZekerFlex-platform
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-crit hover:border-crit">Uitloggen</button>
            </form>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-neutralx-600">
            Je bestelt in deze shop als gast — geen account nodig. Log in om je bestelgeschiedenis hier te zien.
          </p>

          <section className="mt-8 rounded-2xl border border-hair p-6">
            <h2 className="font-display text-lg font-bold">Bestelling opzoeken</h2>
            <p className="mt-1 text-sm text-neutralx-500">Plak de referentie uit je bevestigingsmail.</p>
            <form
              onSubmit={(e) => { e.preventDefault(); if (lookupId.trim()) router.push(`/shop/bestelling/${lookupId.trim()}`); }}
              className="mt-3 flex gap-2"
            >
              <input
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                placeholder="bv. cmv8qlly9000013h3cpz63tbi"
                className="flex-1 rounded-lg border border-hairstrong px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white">Zoeken</button>
            </form>
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login?callbackUrl=/shop/account" className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white">Inloggen</Link>
            <Link href="/register?callbackUrl=/shop/account" className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold hover:border-ink">Account maken</Link>
          </div>
        </>
      )}

      <section className="mt-10 rounded-2xl border border-hair p-6">
        <h2 className="font-display text-lg font-bold">Je favorieten{wishlist.count > 0 ? ` (${wishlist.count})` : ""}</h2>
        {products.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-500">
            Nog niets aan je favorieten toegevoegd. Klik op het hartje bij een product in de{" "}
            <Link href="/shop" className="font-semibold text-brand-600 underline">shop</Link>.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {products.map((p) => (
              <Link key={p.id} href={p.slug ? `/shop/${p.slug}` : "/shop"} className="group">
                <div className="aspect-square overflow-hidden rounded-xl bg-paper-soft">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full place-items-center"><LogoGlyph size={32} tone="dark" /></div>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-1 text-xs font-semibold">{p.name}</p>
                <p className="text-xs text-neutralx-500">{money(p.priceCents)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
