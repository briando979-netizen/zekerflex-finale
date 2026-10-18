"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/lib/auth/actions";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { LogoGlyph } from "@/components/brand/Logo";
import { useT } from "@/components/i18n/I18nProvider";

export type ShopAccountOrder = {
  id: string;
  status: "PENDING_PAYMENT" | "RECEIVED" | "CONFIRMED" | "SHIPPED" | "CANCELLED" | "PAYMENT_FAILED";
  totalCents: number;
  itemCount: number;
  createdAt: string;
};

type WishlistProduct = { id: string; slug?: string | null; name: string; priceCents: number; imageUrl: string | null };

const money = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export function ShopAccount({
  principal,
  orders,
}: {
  principal: { fullName: string; email: string } | null;
  orders: ShopAccountOrder[];
}) {
  const t = useT();
  const STATUS_LABEL: Record<ShopAccountOrder["status"], string> = {
    PENDING_PAYMENT: t.shop.orderStatusPending,
    RECEIVED: t.shop.orderStatusReceived,
    CONFIRMED: t.shop.orderStatusConfirmed,
    SHIPPED: t.shop.orderStatusShipped,
    CANCELLED: t.shop.orderStatusCancelled,
    PAYMENT_FAILED: t.shop.orderStatusFailed,
  };
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
      <h1 className="font-display text-3xl font-bold">{t.shop.myAccount}</h1>

      {principal ? (
        <>
          <p className="mt-2 text-sm text-neutralx-600">
            <span className="font-semibold text-ink">{principal.fullName}</span> — {principal.email}
          </p>

          <section className="mt-8 rounded-2xl border border-hair p-6">
            <h2 className="font-display text-lg font-bold">{t.shop.yourOrders}</h2>
            {orders.length === 0 ? (
              <p className="mt-2 text-sm text-neutralx-500">{t.shop.noOrdersYet}</p>
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
              {t.shop.toPlatform}
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-crit hover:border-crit">{t.shop.logout}</button>
            </form>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-neutralx-600">
            {t.shop.guestIntro}
          </p>

          <section className="mt-8 rounded-2xl border border-hair p-6">
            <h2 className="font-display text-lg font-bold">{t.shop.findOrder}</h2>
            <p className="mt-1 text-sm text-neutralx-500">{t.shop.pasteReference}</p>
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
              <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white">{t.shop.searchButton}</button>
            </form>
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login?callbackUrl=/shop/account" className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white">{t.shop.login}</Link>
            <Link href="/register?callbackUrl=/shop/account" className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold hover:border-ink">{t.shop.createAccount}</Link>
          </div>
        </>
      )}

      <section className="mt-10 rounded-2xl border border-hair p-6">
        <h2 className="font-display text-lg font-bold">{t.shop.favorites}{wishlist.count > 0 ? ` (${wishlist.count})` : ""}</h2>
        {products.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-500">{t.shop.noFavoritesInAccount}</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {products.map((p) => (
              <Link key={p.id} href={p.slug ? `/shop/${p.slug}` : "/shop"} className="group">
                <div className="aspect-square overflow-hidden rounded-xl bg-paper-soft">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-105" />
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
