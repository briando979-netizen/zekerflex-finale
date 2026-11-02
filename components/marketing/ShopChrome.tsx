"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { useShopCart } from "@/components/marketing/useShopCart";
import { CookieSettingsButton } from "@/components/marketing/CookieSettingsButton";
import { useI18n, setLocale } from "@/components/i18n/I18nProvider";
import { EMPLOYER_LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/dictionaries";

// Gedeelde shop-omlijsting: aankondigingsbalk, kop met categorieën + logo +
// winkelwagen, de voettekst, de winkelwagen-lade en het afrekenvenster. Zit in
// app/shop/layout.tsx, dus elke /shop-pagina krijgt hem.
// Andere onderdelen openen de lade met window-event "zf:shop-cart-open".

type ApiVariant = { id: string; size: string | null; color: string | null; priceCents: number | null; stock: number };
type ApiProduct = { id: string; slug?: string | null; name: string; priceCents: number; imageUrl?: string | null; variants?: ApiVariant[] };
type CartLine = { variantId: string; name: string; priceCents: number; imageUrl: string | null; qty: number };

export const CART_OPEN_EVENT = "zf:shop-cart-open";
const money = (v: number) => `€ ${v.toFixed(2).replace(".", ",")}`;
const CAPS = "text-[12px] font-semibold uppercase tracking-[0.14em]";
const WRAP = "mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12";

export function ShopChrome({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const NAV = [
    { label: t.shop.navPbm, cat: "Werk & PBM" },
    { label: t.shop.navKleding, cat: "Kleding" },
    { label: t.shop.navWerkdag, cat: "Werkdag" },
    { label: t.shop.navTeams, cat: "Cadeaus" },
  ];
  const [promo, setPromo] = useState(true);
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", address: "", postalCode: "", city: "" });
  const [catalog, setCatalog] = useState<ApiProduct[]>([]);
  const { cart, add, remove, count } = useShopCart();

  // De catalogus is alleen nodig om de winkelwagen te tonen: pas ophalen als
  // er iets in zit of de lade opengaat (eerder op elke pagina, ook bij leeg).
  const needCatalog = count > 0 || drawer;
  useEffect(() => {
    if (!needCatalog || catalog.length > 0) return;
    fetch("/api/shop/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => setCatalog(d.products ?? []))
      .catch(() => undefined);
  }, [needCatalog, catalog.length]);

  useEffect(() => {
    const open = () => setDrawer(true);
    window.addEventListener(CART_OPEN_EVENT, open);
    return () => window.removeEventListener(CART_OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (!drawer && !menu && !checkout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDrawer(false);
      setMenu(false);
      setCheckout(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, menu, checkout]);

  // De winkelwagen sleutelt op variantId (maat/kleur), niet op productId.
  const items = useMemo<CartLine[]>(() => {
    const byVariantId = new Map<string, { product: ApiProduct; variant: ApiVariant }>();
    for (const p of catalog) for (const v of p.variants ?? []) byVariantId.set(v.id, { product: p, variant: v });
    return Object.entries(cart)
      .map(([variantId, qty]) => {
        const hit = byVariantId.get(variantId);
        if (!hit) return null;
        const { product, variant } = hit;
        const label = [variant.size ? `${t.shop.size} ${variant.size}` : null, variant.color].filter(Boolean).join(", ");
        return { variantId, name: label ? `${product.name} — ${label}` : product.name, priceCents: variant.priceCents ?? product.priceCents, imageUrl: product.imageUrl ?? null, qty };
      })
      .filter((l): l is CartLine => l !== null);
  }, [catalog, cart, t]);
  const subtotal = items.reduce((s, p) => s + (p.priceCents / 100) * p.qty, 0);
  const shipping = subtotal >= 50 || subtotal === 0 ? 0 : 4.95;
  const total = subtotal + shipping;

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setOrderError("");
    setPlacing(true);
    try {
      const response = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items: items.map((l) => ({ variantId: l.variantId, qty: l.qty })) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setOrderError(data?.error?.message ?? "Bestelling plaatsen is mislukt. Probeer het opnieuw.");
        return;
      }
      if (!data.checkoutUrl) {
        setOrderError("Kon geen betaalscherm starten. Probeer het opnieuw.");
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setOrderError("Geen verbinding — controleer je internet en probeer het opnieuw.");
    } finally {
      setPlacing(false);
    }
  };

  const languageSelect = (cls: string) => (
    <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={t.shell.language} className={cls}>
      {EMPLOYER_LOCALES.map((code) => (
        <option key={code} value={code}>{LOCALE_LABELS[code]}</option>
      ))}
    </select>
  );

  return (
    <div className="min-h-screen bg-white font-sans text-lux-ink">
      {promo && (
        <div className="relative bg-lux-ink text-center text-white">
          <p className="px-10 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white/85">{t.shop.announcement}</p>
          <button type="button" onClick={() => setPromo(false)} aria-label={t.shop.close} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-lg leading-none text-white/70 hover:text-white">
            ×
          </button>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-lux-line bg-white/85 backdrop-blur-md">
        <div className={`${WRAP} grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4`}>
          <div className="flex items-center gap-7">
            <button type="button" onClick={() => setMenu(true)} aria-label={t.shop.menu} className="-ml-2 grid h-10 w-10 place-items-center lg:hidden">
              <IconMenu />
            </button>
            <nav aria-label="Winkelnavigatie" className="hidden items-center gap-7 lg:flex">
              {NAV.map((n) => (
                <Link key={n.cat} href={`/shop?cat=${encodeURIComponent(n.cat)}#collectie`} className={`${CAPS} whitespace-nowrap text-lux-ink/80 transition hover:text-lux-ink`}>
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>

          <Link href="/shop" className="flex items-center gap-2.5" aria-label="ZekerFlex Shop">
            <LogoGlyph size={26} tone="dark" />
            <span className="font-serif text-[1.65rem] leading-none tracking-[-0.01em]">
              ZekerFlex <span className="align-middle text-[10px] font-sans font-semibold uppercase tracking-[0.3em] text-lux-gold">Shop</span>
            </span>
          </Link>

          <div className="flex items-center justify-end gap-1 sm:gap-2">
            {languageSelect("hidden rounded-full border border-lux-line bg-transparent px-2.5 py-1 text-[11px] font-semibold text-lux-mute sm:inline")}
            <Link href="/shop/account" aria-label={t.shop.account} className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-lux-stone">
              <IconUser />
            </Link>
            <button type="button" onClick={() => setDrawer(true)} aria-label={`${t.shop.cart} (${count})`} className="relative grid h-10 w-10 place-items-center rounded-full transition hover:bg-lux-stone">
              <IconBag />
              {count > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-lux-ink px-1 text-[10px] font-semibold text-white">{count}</span>}
            </button>
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-lux-line bg-lux-bg">
        <div className={`${WRAP} grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]`}>
          <div>
            <p className="font-serif text-3xl leading-none">ZekerFlex</p>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-lux-mute">{t.shop.uspCertified} · {t.shop.uspReturns}</p>
          </div>
          <FooterCol title={t.shop.help} links={[{ label: t.shop.faq, href: "/kennis/faq" }, { label: t.shop.contact, href: "/contact" }, { label: t.shop.orderStatus, href: "/shop/account" }]} />
          <FooterCol title={t.shop.ordering} links={[{ label: t.shop.businessQuote, href: "/contact" }, { label: t.shop.terms, href: "/voorwaarden" }, { label: t.shop.myAccount, href: "/shop/account" }]} />
          <FooterCol title="ZekerFlex" links={[{ label: "Over ZekerFlex", href: "/over-ons" }, { label: "Werken bij", href: "/over-ons#werken-bij" }, { label: "Uitleg in het kort", href: "/uitleg" }, { label: t.shop.toPlatform, href: "/dashboard" }]} />
          <div>
            <p className={`${CAPS} text-[11px] text-lux-mute`}>{t.shop.payWith}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["iDEAL", "Mastercard", "Visa", "Apple Pay", "Op rekening"].map((m) => (
                <span key={m} className="border border-lux-line bg-white px-2 py-1 text-[11px] text-lux-mute">{m}</span>
              ))}
            </div>
            <p className={`${CAPS} mt-6 text-[11px] text-lux-mute`}>{t.shop.deliveredBy}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["PostNL", "DHL"].map((m) => (
                <span key={m} className="border border-lux-line bg-white px-2 py-1 text-[11px] text-lux-mute">{m}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-lux-line">
          <div className={`${WRAP} flex flex-col items-center justify-between gap-3 py-6 text-[12px] text-lux-mute sm:flex-row`}>
            <p>© {new Date().getFullYear()} ZekerFlex · Werk & PBM shop</p>
            <div className="flex flex-wrap justify-center gap-5">
              <Link href="/privacy" className="hover:text-lux-ink">Privacyverklaring</Link>
              <Link href="/voorwaarden" className="hover:text-lux-ink">{t.shop.terms}</Link>
              <Link href="/cookiebeleid" className="hover:text-lux-ink">Cookiebeleid</Link>
              <CookieSettingsButton className="hover:text-lux-ink" />
              <Link href="/toegankelijkheid" className="hover:text-lux-ink">Toegankelijkheid</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* menu op de telefoon */}
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.shop.menu}>
          <button type="button" aria-label={t.shop.close} onClick={() => setMenu(false)} className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white">
            <div className="flex h-16 items-center justify-between border-b border-lux-line px-5">
              <span className="font-serif text-2xl">ZekerFlex</span>
              <button type="button" onClick={() => setMenu(false)} aria-label={t.shop.close} className="grid h-10 w-10 place-items-center text-xl">×</button>
            </div>
            <nav className="flex-1 overflow-y-auto px-5 py-4">
              {NAV.map((n) => (
                <Link key={n.cat} href={`/shop?cat=${encodeURIComponent(n.cat)}#collectie`} onClick={() => setMenu(false)} className="block border-b border-lux-line py-4 font-serif text-2xl">
                  {n.label}
                </Link>
              ))}
              <Link href="/shop/account" onClick={() => setMenu(false)} className={`${CAPS} mt-6 block py-2 text-lux-mute`}>
                {t.shop.account}
              </Link>
            </nav>
            <div className="border-t border-lux-line px-5 py-4">{languageSelect("w-full rounded-full border border-lux-line bg-transparent px-3 py-2 text-[13px]")}</div>
          </aside>
        </div>
      )}

      {/* winkelwagen-lade */}
      {drawer && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t.shop.cart}>
          <button type="button" aria-label={t.shop.close} onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/40" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white">
            <div className="flex items-center justify-between border-b border-lux-line px-6 py-5">
              <h2 className="font-serif text-2xl">
                {t.shop.cart} <span className="text-lux-mute">({count})</span>
              </h2>
              <button type="button" onClick={() => setDrawer(false)} aria-label={t.shop.close} className="grid h-10 w-10 place-items-center rounded-full text-xl hover:bg-lux-stone">×</button>
            </div>
            {items.length > 0 && (
              <div className="border-b border-lux-line px-6 py-4">
                {subtotal >= 50 ? (
                  <p className="text-[12px] text-lux-ink">✓ {t.shop.freeShippingDone}</p>
                ) : (
                  <>
                    <p className="text-[12px] text-lux-mute">{fmt(t.shop.freeShippingLeft, { amount: money(50 - subtotal) })}</p>
                    <div className="mt-2 h-[3px] overflow-hidden bg-lux-stone">
                      <div className="h-full bg-lux-gold transition-all" style={{ width: `${Math.min(100, (subtotal / 50) * 100)}%` }} />
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {items.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-center">
                  <span className="text-lux-mute" aria-hidden>
                    <IconBag size={32} />
                  </span>
                  <p className="mt-5 font-serif text-2xl">{t.shop.cartEmpty}</p>
                  <button type="button" onClick={() => setDrawer(false)} className={`${CAPS} mt-7 rounded-full border border-lux-line px-6 py-3 hover:border-lux-ink`}>
                    {t.shop.continueShopping}
                  </button>
                </div>
              ) : (
                <ul className="space-y-5">
                  {items.map((l) => (
                    <li key={l.variantId} className="flex gap-4">
                      <div className="relative h-24 w-[76px] shrink-0 overflow-hidden bg-lux-stone">
                        {l.imageUrl ? <Image src={l.imageUrl} alt="" fill sizes="76px" className="object-cover" /> : <div className="grid h-full place-items-center"><LogoGlyph size={26} /></div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] leading-snug">{l.name}</p>
                        <p className="mt-1 text-[12px] text-lux-mute">{money(l.priceCents / 100)}</p>
                        <div className="mt-2.5 inline-flex items-center border border-lux-line text-[13px]">
                          <button type="button" onClick={() => remove(l.variantId)} aria-label="Minder" className="px-3 py-1.5">−</button>
                          <span className="min-w-6 text-center">{l.qty}</span>
                          <button type="button" onClick={() => add(l.variantId)} aria-label="Meer" className="px-3 py-1.5">+</button>
                        </div>
                      </div>
                      <p className="text-[14px]">{money((l.priceCents / 100) * l.qty)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {items.length > 0 && (
              <div className="border-t border-lux-line px-6 py-5">
                <div className="flex justify-between text-[13px] text-lux-mute"><span>{t.shop.subtotal}</span><span>{money(subtotal)}</span></div>
                <div className="mt-1.5 flex justify-between text-[13px] text-lux-mute"><span>{t.shop.shipping}</span><span>{shipping === 0 ? t.shop.free : money(shipping)}</span></div>
                <div className="mt-4 flex items-baseline justify-between"><span className="font-serif text-2xl">{t.shop.total}</span><span className="text-[17px] font-semibold">{money(total)}</span></div>
                <button type="button" onClick={() => { setDrawer(false); setCheckout(true); }} className={`${CAPS} mt-5 w-full rounded-full bg-lux-ink py-4 text-white transition hover:bg-black`}>
                  {t.shop.checkout}
                </button>
                <Link href="/shop/account" onClick={() => setDrawer(false)} className="mt-4 block text-center text-[12px] text-lux-mute hover:text-lux-ink">
                  {t.shop.myOrdersAndFavorites}
                </Link>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* afrekenen */}
      {checkout && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 px-4 py-8" role="dialog" aria-modal="true" aria-label={t.shop.checkoutTitle}>
          <div className="mx-auto max-w-xl bg-white p-7 sm:p-10">
            <div className="flex items-start justify-between">
              <h2 className="font-serif text-3xl">{t.shop.checkoutTitle}</h2>
              <button type="button" onClick={() => setCheckout(false)} aria-label={t.shop.close} className="grid h-10 w-10 place-items-center rounded-full text-xl hover:bg-lux-stone">×</button>
            </div>
            <form onSubmit={placeOrder} className="mt-7 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">{t.shop.firstName}<input required className="field-input" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></label>
                <label className="field-label">{t.shop.lastName}<input required className="field-input" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></label>
              </div>
              <label className="field-label">{t.shop.email}<input required type="email" className="field-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
              <label className="field-label">{t.shop.address}<input required className="field-input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></label>
              <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                <label className="field-label">{t.shop.postalCode}<input required className="field-input" value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} /></label>
                <label className="field-label">{t.shop.city}<input required className="field-input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></label>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-lux-line pt-5"><span className="font-serif text-2xl">{t.shop.total}</span><span className="text-[17px] font-semibold">{money(total)}</span></div>
              {orderError && <p role="alert" className="text-sm font-semibold text-crit">{orderError}</p>}
              <button className={`${CAPS} w-full rounded-full bg-lux-ink py-4 text-white transition hover:bg-black disabled:opacity-60`} type="submit" disabled={placing || items.length === 0}>
                {placing ? t.shop.toPaymentPending : t.shop.toPayment}
              </button>
              <p className="text-center text-[11px] text-lux-mute">{t.shop.securePaymentNote}</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lux-mute">{title}</p>
      <ul className="mt-4 space-y-2.5 text-[13px]">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="transition hover:text-lux-gold">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IconUser() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </svg>
  );
}
function IconBag({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}
