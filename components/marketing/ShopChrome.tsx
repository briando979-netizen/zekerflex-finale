"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { useShopCart } from "@/components/marketing/useShopCart";
import { useShopWishlist } from "@/components/marketing/useShopWishlist";
import { CookieSettingsButton } from "@/components/marketing/CookieSettingsButton";
import { useI18n, setLocale } from "@/components/i18n/I18nProvider";
import { EMPLOYER_LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { fmt, type Dict } from "@/lib/i18n/dictionaries";
import { ShopModusProvider, useShopModus } from "@/components/marketing/ShopModus";
import { btwOverzicht, btwTarief, type ShopModus } from "@/lib/shop/modus";

// Gedeelde shop-omlijsting, opgebouwd als een marktplaats: een servicebalk, de
// merkbalk met een grote zoekbalk (blijft staan tijdens scrollen), de
// categoriebalk, de voettekst, de winkelwagen-lade en het afrekenvenster. Zit in
// app/shop/layout.tsx, dus elke /shop-pagina krijgt hem. Andere onderdelen
// openen de lade met window-event "zf:shop-cart-open".

type ApiVariant = { id: string; size: string | null; color: string | null; priceCents: number | null; stock: number };
type ApiProduct = { id: string; slug?: string | null; name: string; priceCents: number; imageUrl?: string | null; variants?: ApiVariant[] };
type CartLine = { variantId: string; name: string; priceCents: number; imageUrl: string | null; qty: number; tarief: number };

export const CART_OPEN_EVENT = "zf:shop-cart-open";
// Partnerlink (/shop/p/<code> → ?partner=<code>): alleen in het open tabblad
// onthouden (sessionStorage, geen cookie) en meegestuurd met de bestelling.
const PARTNER_KEY = "zf_shop_partner";
const readPartner = (): string | undefined => {
  try {
    return window.sessionStorage.getItem(PARTNER_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};
const money = (v: number) => `€ ${v.toFixed(2).replace(".", ",")}`;
const WRAP = "mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8";
const CATS = ["Werk & PBM", "Kleding", "Werkdag", "Cadeaus"] as const;

/** De omlijsting met de keuze particulier/zakelijk (uit het cookie, gelezen in app/shop/layout.tsx). */
export function ShopChrome({ children, modus = "particulier" }: { children: ReactNode; modus?: ShopModus }) {
  return (
    <ShopModusProvider modus={modus}>
      <ShopOmlijsting>{children}</ShopOmlijsting>
    </ShopModusProvider>
  );
}

type NavItem = { label: string; href: string };

/** Het menu onder de zoekbalk: particulier per soort artikel, zakelijk per manier van bestellen. */
function navVoor(modus: ShopModus, t: Dict): NavItem[] {
  const cat = (c: string) => `/shop?cat=${encodeURIComponent(c)}#collectie`;
  return modus === "zakelijk"
    ? [
        { label: t.shop.navPbm, href: cat("Werk & PBM") },
        { label: t.shopZakelijk.navBedrijfskleding, href: cat("Kleding") },
        { label: t.shopZakelijk.navPakketten, href: "/shop/zakelijk#pakketten" },
        { label: t.shopZakelijk.navTeam, href: "/shop/zakelijk#team" },
        { label: t.shopZakelijk.navOfferte, href: "/shop/zakelijk#offerte" },
      ]
    : [
        { label: t.shop.navKleding, href: cat("Kleding") },
        { label: t.shop.navPbm, href: cat("Werk & PBM") },
        { label: t.shop.navWerkdag, href: cat("Werkdag") },
        { label: t.shopZakelijk.navCadeaus, href: cat("Cadeaus") },
      ];
}

function ShopOmlijsting({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const { modus } = useShopModus();
  const NAV = navVoor(modus, t);
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", address: "", postalCode: "", city: "" });
  // op bedrijfsnaam bestellen: altijd open in de zakelijke stand, particulier op verzoek
  const [zak, setZak] = useState({ companyName: "", vatNumber: "", reference: "" });
  const [zakOpen, setZakOpen] = useState(false);
  const [catalog, setCatalog] = useState<ApiProduct[]>([]);
  const { cart, add, remove, count } = useShopCart();
  const wishlist = useShopWishlist();

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
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("partner");
      if (!code) return;
      if (/^[a-z0-9-]{6,30}$/.test(code)) window.sessionStorage.setItem(PARTNER_KEY, code);
      // het adres weer schoon, zodat iemand die het deelt de code niet meestuurt
      url.searchParams.delete("partner");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* zonder sessionStorage werkt de shop gewoon, alleen zonder partner */
    }
  }, []);

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
        return { variantId, name: label ? `${product.name} — ${label}` : product.name, priceCents: variant.priceCents ?? product.priceCents, imageUrl: product.imageUrl ?? null, qty, tarief: btwTarief(product) };
      })
      .filter((l): l is CartLine => l !== null);
  }, [catalog, cart, t]);
  const subtotal = items.reduce((s, p) => s + (p.priceCents / 100) * p.qty, 0);
  const shipping = subtotal >= 50 || subtotal === 0 ? 0 : 4.95;
  const total = subtotal + shipping;
  // zakelijk: hetzelfde bedrag, maar zonder btw met de btw apart
  const btw = btwOverzicht(items.map((l) => ({ centenIncl: l.priceCents, tarief: l.tarief, aantal: l.qty })), Math.round(shipping * 100));

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setOrderError("");
    setPlacing(true);
    try {
      const response = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: items.map((l) => ({ variantId: l.variantId, qty: l.qty })),
          partner: readPartner(),
          ...(zak.companyName.trim() ? { companyName: zak.companyName.trim() } : {}),
          ...(zak.vatNumber.trim() ? { vatNumber: zak.vatNumber.trim() } : {}),
          ...(zak.reference.trim() ? { reference: zak.reference.trim() } : {}),
        }),
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
        <option key={code} value={code}>
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  );

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <a href="#shop-inhoud" className="sr-only z-[60] rounded-md bg-white px-4 py-2 text-[14px] font-semibold text-ink focus-visible:not-sr-only focus-visible:fixed focus-visible:left-3 focus-visible:top-3">
        {t.shop.skipToContent}
      </a>

      {/* servicebalk */}
      <aside aria-label={t.shop.serviceTitle} className="bg-ink text-white">
        <div className={`${WRAP} flex h-10 items-center justify-between gap-4 text-[12px]`}>
          <ModusKeuze t={t} />
          <ul className="hidden min-w-0 flex-1 items-center gap-5 overflow-hidden sm:flex">
            <ServicePoint>{t.shop.uspNextDay}</ServicePoint>
            <ServicePoint className="hidden lg:flex">{t.shop.freeShipping}</ServicePoint>
            <ServicePoint className="hidden xl:flex">{t.shop.uspReturns}</ServicePoint>
          </ul>
          <div className="hidden shrink-0 items-center gap-5 md:flex">
            <Link href="/kennis/faq" className="text-white/85 hover:text-white hover:underline">
              {t.shop.customerService}
            </Link>
            {languageSelect("rounded border border-white/25 bg-transparent px-1.5 py-0.5 text-[12px] text-white [&>option]:text-ink")}
          </div>
        </div>
      </aside>

      {/* merkbalk met zoeken: blijft staan tijdens scrollen */}
      <header className="sticky top-0 z-40 bg-brand-700 text-white shadow-e1">
        <div className={`${WRAP} flex h-14 items-center gap-2 sm:gap-4 lg:h-[72px] lg:gap-6`}>
          <button type="button" onClick={() => setMenu(true)} aria-label={t.shop.menu} className="-ml-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-white/10 lg:hidden">
            <IconMenu />
          </button>
          <Link href="/shop" className="flex shrink-0 items-center gap-2" aria-label="ZekerFlex Shop">
            <LogoGlyph size={30} tone="light" />
            <span className="font-display text-[18px] font-extrabold leading-none tracking-tight sm:text-[20px] lg:text-[22px]">
              ZekerFlex<span className="ml-1 hidden text-brand-mint min-[380px]:inline">shop</span>
            </span>
          </Link>
          <div className="hidden min-w-0 flex-1 md:block">
            <SearchForm t={t} id="zoek-kop" />
          </div>
          <nav aria-label={t.shop.account} className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <HeaderLink href="/shop/account" label={t.shop.account}>
              <IconUser />
            </HeaderLink>
            {/* op de telefoon via Mijn account: anders past de kop niet op 320px */}
            <HeaderLink href="/shop/account" label={t.shop.favorites} badge={wishlist.count} className="hidden sm:flex">
              <IconHeartLine />
            </HeaderLink>
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label={`${t.shop.cart} (${count})`}
              className="relative flex h-11 items-center gap-2 rounded-lg px-2 transition hover:bg-white/10 sm:px-2.5"
            >
              <IconCart />
              <span className="hidden text-[13px] font-semibold xl:inline">{t.shop.cart}</span>
              {count > 0 && (
                <span className="absolute left-6 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-mint px-1 text-[11px] font-bold text-ink">{count}</span>
              )}
            </button>
          </nav>
        </div>
        <div className="px-4 pb-2.5 sm:px-6 md:hidden">
          <SearchForm t={t} id="zoek-telefoon" />
        </div>
      </header>

      {/* categoriebalk */}
      <nav aria-label={t.shop.allCategories} className="border-b border-hair bg-white">
        <div className={`${WRAP} flex h-12 items-center gap-1 overflow-x-auto [scrollbar-width:none]`}>
          <button type="button" onClick={() => setMenu(true)} className="hidden h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[14px] font-bold text-ink hover:bg-paper-soft lg:inline-flex">
            <IconMenu />
            {t.shop.allCategories}
          </button>
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-hair lg:block" />
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-[14px] font-semibold text-ink transition hover:bg-paper-soft">
              {n.label}
            </Link>
          ))}
          <Link href="/shop/paskamer" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold text-ink transition hover:bg-paper-soft">
            {t.paskamer.navLabel}
            <span className="rounded-full bg-brand-mint px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-ink">{t.paskamer.nieuw}</span>
          </Link>
          <Link href={modus === "zakelijk" ? "/shop" : "/shop/zakelijk"} className="ml-auto hidden h-9 shrink-0 items-center rounded-lg px-3 text-[14px] font-semibold text-brand-600 hover:bg-brand-50 lg:inline-flex">
            {modus === "zakelijk" ? t.shopZakelijk.naarParticulier : t.shopZakelijk.naarZakelijk} →
          </Link>
        </div>
      </nav>

      <main id="shop-inhoud" tabIndex={-1} className="outline-none">
        {children}
      </main>

      <footer className="bg-ink text-white">
        <div className="border-b border-white/10">
          <ul className={`${WRAP} grid gap-x-6 gap-y-3 py-7 text-[13px] sm:grid-cols-2 lg:grid-cols-4`}>
            {[t.shop.uspNextDay, t.shop.freeShipping, t.shop.uspReturns, t.shop.uspInvoice].map((u) => (
              <ServicePoint key={u} className="text-white/90" wrap>
                {u}
              </ServicePoint>
            ))}
          </ul>
        </div>
        <div className={`${WRAP} grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.3fr]`}>
          <div>
            <p className="flex items-center gap-2 font-display text-[22px] font-extrabold">
              <LogoGlyph size={28} tone="light" />
              ZekerFlex<span className="text-brand-mint">shop</span>
            </p>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/70">{t.shop.uspCertified}</p>
          </div>
          <FooterCol title={t.shop.help} links={[{ label: t.shop.faq, href: "/kennis/faq" }, { label: t.shop.contact, href: "/contact" }, { label: t.shop.orderStatus, href: "/shop/account" }]} />
          <FooterCol title={t.shop.ordering} links={[{ label: t.shop.businessQuote, href: "/contact" }, { label: t.shop.terms, href: "/voorwaarden" }, { label: t.shop.myAccount, href: "/shop/account" }]} />
          <FooterCol title="ZekerFlex" links={[{ label: "Over ZekerFlex", href: "/over-ons" }, { label: "Werken bij", href: "/over-ons#werken-bij" }, { label: "Uitleg in het kort", href: "/uitleg" }, { label: t.shop.toPlatform, href: "/dashboard" }]} />
          <div>
            <p className="text-[13px] font-bold">{t.shop.payWith}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["iDEAL", "Mastercard", "Visa", "Apple Pay", "Op rekening"].map((m) => (
                <span key={m} className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-ink">
                  {m}
                </span>
              ))}
            </div>
            <p className="mt-6 text-[13px] font-bold">{t.shop.deliveredBy}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["PostNL", "DHL"].map((m) => (
                <span key={m} className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-ink">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className={`${WRAP} flex flex-col items-center justify-between gap-3 py-5 text-[12px] text-white/70 sm:flex-row`}>
            <p>© {new Date().getFullYear()} ZekerFlex · Werk & PBM shop</p>
            <div className="flex flex-wrap justify-center gap-5">
              <Link href="/privacy" className="hover:text-white">
                Privacyverklaring
              </Link>
              <Link href="/voorwaarden" className="hover:text-white">
                {t.shop.terms}
              </Link>
              <Link href="/cookiebeleid" className="hover:text-white">
                Cookiebeleid
              </Link>
              <CookieSettingsButton className="hover:text-white" />
              <Link href="/toegankelijkheid" className="hover:text-white">
                Toegankelijkheid
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* alle categorieën (telefoon: het menu) */}
      {menu && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t.shop.allCategories}>
          <button type="button" aria-label={t.shop.close} onClick={() => setMenu(false)} className="absolute inset-0 bg-black/45" />
          <aside className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white">
            <div className="flex h-14 items-center justify-between bg-brand-700 px-4 text-white">
              <span className="text-[16px] font-bold">{t.shop.allCategories}</span>
              <button type="button" onClick={() => setMenu(false)} aria-label={t.shop.close} className="grid h-10 w-10 place-items-center rounded-lg text-xl hover:bg-white/10">
                ×
              </button>
            </div>
            <nav aria-label={t.shop.allCategories} className="flex-1 overflow-y-auto py-2">
              <Link href="/shop#collectie" onClick={() => setMenu(false)} className="flex items-center justify-between border-b border-hair px-5 py-3.5 text-[15px] font-semibold text-ink hover:bg-paper-soft">
                {t.shop.allCategories} <span aria-hidden>›</span>
              </Link>
              <div className="border-b border-hair px-5 py-3">
                <ModusKeuze t={t} licht onGekozen={() => setMenu(false)} />
              </div>
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenu(false)}
                  className="flex items-center justify-between border-b border-hair px-5 py-3.5 text-[15px] font-semibold text-ink hover:bg-paper-soft"
                >
                  {n.label} <span aria-hidden>›</span>
                </Link>
              ))}
              <Link href="/shop/paskamer" onClick={() => setMenu(false)} className="flex items-center justify-between border-b border-hair px-5 py-3.5 text-[15px] font-semibold text-ink hover:bg-paper-soft">
                <span className="inline-flex items-center gap-2">
                  {t.paskamer.navLabel}
                  <span className="rounded-full bg-brand-mint px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-ink">{t.paskamer.nieuw}</span>
                </span>
                <span aria-hidden>›</span>
              </Link>
              <div className="mt-3 space-y-1 px-5 py-2 text-[14px]">
                <Link href="/shop/account" onClick={() => setMenu(false)} className="block py-2 text-ink hover:underline">
                  {t.shop.account}
                </Link>
                <Link href={modus === "zakelijk" ? "/shop" : "/shop/zakelijk"} onClick={() => setMenu(false)} className="block py-2 text-ink hover:underline">
                  {modus === "zakelijk" ? t.shopZakelijk.naarParticulier : t.shopZakelijk.naarZakelijk}
                </Link>
                <Link href="/kennis/faq" onClick={() => setMenu(false)} className="block py-2 text-ink hover:underline">
                  {t.shop.customerService}
                </Link>
              </div>
            </nav>
            <div className="border-t border-hair px-5 py-4">{languageSelect("w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-[14px]")}</div>
          </aside>
        </div>
      )}

      {/* winkelwagen-lade */}
      {drawer && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t.shop.cart}>
          <button type="button" aria-label={t.shop.close} onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/45" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white">
            <div className="flex items-center justify-between border-b border-hair px-5 py-4">
              <h2 className="text-[19px] font-bold text-ink">
                {t.shop.cart} <span className="font-normal text-neutralx-500">({count})</span>
              </h2>
              <button type="button" onClick={() => setDrawer(false)} aria-label={t.shop.close} className="grid h-10 w-10 place-items-center rounded-full text-xl hover:bg-paper-soft">
                ×
              </button>
            </div>
            {items.length > 0 && (
              <div className="border-b border-hair px-5 py-3.5">
                {subtotal >= 50 ? (
                  <p className="text-[13px] font-semibold text-ok">✓ {t.shop.freeShippingDone}</p>
                ) : (
                  <>
                    <p className="text-[13px] text-neutralx-600">{fmt(t.shop.freeShippingLeft, { amount: money(50 - subtotal) })}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-200">
                      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, (subtotal / 50) * 100)}%` }} />
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {items.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-center">
                  <span className="text-neutralx-400" aria-hidden>
                    <IconCart size={34} />
                  </span>
                  <p className="mt-4 text-[18px] font-semibold text-ink">{t.shop.cartEmpty}</p>
                  <button type="button" onClick={() => setDrawer(false)} className="mt-6 h-11 rounded-lg bg-brand-500 px-6 text-[14px] font-bold text-white hover:bg-brand-600">
                    {t.shop.continueShopping}
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-hair">
                  {items.map((l) => (
                    <li key={l.variantId} className="flex gap-3.5 py-4 first:pt-0">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-hair bg-paper-soft">
                        {l.imageUrl ? (
                          <Image src={l.imageUrl} alt="" fill sizes="80px" className="object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center">
                            <LogoGlyph size={26} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold leading-snug text-ink">{l.name}</p>
                        <p className="mt-0.5 text-[12px] text-neutralx-500">{money(l.priceCents / 100)}</p>
                        <div className="mt-2 inline-flex items-center rounded-lg border border-hairstrong text-[14px]">
                          <button type="button" onClick={() => remove(l.variantId)} aria-label="Minder" className="h-8 w-8">
                            −
                          </button>
                          <span className="min-w-6 text-center font-semibold">{l.qty}</span>
                          <button type="button" onClick={() => add(l.variantId)} aria-label="Meer" className="h-8 w-8">
                            +
                          </button>
                        </div>
                      </div>
                      <p className="text-[14px] font-bold text-ink">{money((l.priceCents / 100) * l.qty)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {items.length > 0 && (
              <div className="border-t border-hair px-5 py-5">
                {modus === "zakelijk" ? (
                  <>
                    <div className="flex justify-between text-[13px] text-neutralx-600">
                      <span>{t.shopZakelijk.subtotaalExcl}</span>
                      <span>{money(btw.excl / 100)}</span>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[13px] text-neutralx-600">
                      <span>{t.shopZakelijk.btw}</span>
                      <span>{money(btw.btw / 100)}</span>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[13px] text-neutralx-600">
                      <span>{t.shopZakelijk.verzendingIncl}</span>
                      <span>{shipping === 0 ? t.shop.free : money(shipping)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-[13px] text-neutralx-600">
                      <span>{t.shop.subtotal}</span>
                      <span>{money(subtotal)}</span>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[13px] text-neutralx-600">
                      <span>{t.shop.shipping}</span>
                      <span>{shipping === 0 ? t.shop.free : money(shipping)}</span>
                    </div>
                  </>
                )}
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-[17px] font-bold text-ink">{modus === "zakelijk" ? t.shopZakelijk.totaalIncl : t.shop.total}</span>
                  <span className="text-[20px] font-extrabold text-ink">{money(total)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDrawer(false);
                    setCheckout(true);
                  }}
                  className="mt-4 h-12 w-full rounded-lg bg-brand-500 text-[15px] font-bold text-white transition hover:bg-brand-600"
                >
                  {t.shop.checkout}
                </button>
                <Link href="/shop/account" onClick={() => setDrawer(false)} className="mt-3 block text-center text-[13px] text-neutralx-600 hover:text-ink hover:underline">
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
          <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 sm:p-9">
            <div className="flex items-start justify-between">
              <h2 className="font-display text-[26px] font-bold tracking-tight text-ink">{t.shop.checkoutTitle}</h2>
              <button type="button" onClick={() => setCheckout(false)} aria-label={t.shop.close} className="grid h-10 w-10 place-items-center rounded-full text-xl hover:bg-paper-soft">
                ×
              </button>
            </div>
            <form onSubmit={placeOrder} className="mt-6 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  {t.shop.firstName}
                  <input required autoComplete="given-name" className="field-input" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
                </label>
                <label className="field-label">
                  {t.shop.lastName}
                  <input required autoComplete="family-name" className="field-input" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
                </label>
              </div>
              <label className="field-label">
                {t.shop.email}
                <input required type="email" autoComplete="email" className="field-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label className="field-label">
                {t.shop.address}
                <input required autoComplete="street-address" className="field-input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </label>
              <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                <label className="field-label">
                  {t.shop.postalCode}
                  <input required autoComplete="postal-code" className="field-input" value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} />
                </label>
                <label className="field-label">
                  {t.shop.city}
                  <input required autoComplete="address-level2" className="field-input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                </label>
              </div>
              {modus === "zakelijk" || zakOpen ? (
                <fieldset className="grid gap-4 rounded-xl border border-hair p-4">
                  <legend className="px-1 text-[13px] font-bold text-ink">{t.shopZakelijk.afrekenTitel}</legend>
                  <label className="field-label">
                    {t.shopZakelijk.afrekenBedrijf}
                    <input required={modus === "zakelijk"} autoComplete="organization" className="field-input" value={zak.companyName} onChange={(e) => setZak((z) => ({ ...z, companyName: e.target.value }))} />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="field-label">
                      {t.shopZakelijk.afrekenBtw}
                      <input className="field-input" placeholder="NL123456789B01" value={zak.vatNumber} onChange={(e) => setZak((z) => ({ ...z, vatNumber: e.target.value }))} />
                    </label>
                    <label className="field-label">
                      {t.shopZakelijk.afrekenReferentie}
                      <input className="field-input" maxLength={60} value={zak.reference} onChange={(e) => setZak((z) => ({ ...z, reference: e.target.value }))} />
                    </label>
                  </div>
                  <p className="text-[12px] text-neutralx-500">{t.shopZakelijk.afrekenUitleg}</p>
                </fieldset>
              ) : (
                <button type="button" onClick={() => setZakOpen(true)} className="justify-self-start text-[13px] font-semibold text-brand-600 underline underline-offset-2">
                  {t.shopZakelijk.afrekenOpBedrijf}
                </button>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-hair pt-5">
                <span className="text-[18px] font-bold text-ink">{t.shop.total}</span>
                <span className="text-[20px] font-extrabold text-ink">{money(total)}</span>
              </div>
              {orderError && (
                <p role="alert" className="text-sm font-semibold text-crit">
                  {orderError}
                </p>
              )}
              <button className="h-12 w-full rounded-lg bg-brand-500 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60" type="submit" disabled={placing || items.length === 0}>
                {placing ? t.shop.toPaymentPending : t.shop.toPayment}
              </button>
              <p className="text-center text-[12px] text-neutralx-500">{t.shop.securePaymentNote}</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Particulier of zakelijk: wisselt het cookie, en springt van de ene startpagina naar de andere. */
function ModusKeuze({ t, licht = false, onGekozen }: { t: Dict; licht?: boolean; onGekozen?: () => void }) {
  const { modus, zet } = useShopModus();
  const pad = usePathname();
  const router = useRouter();
  const kies = (m: ShopModus) => {
    onGekozen?.();
    if (m === modus) return;
    zet(m);
    if (m === "zakelijk" && pad === "/shop") router.push("/shop/zakelijk");
    else if (m === "particulier" && pad?.startsWith("/shop/zakelijk")) router.push("/shop");
  };
  const knop = (m: ShopModus, naam: string) => (
    <button
      type="button"
      aria-pressed={modus === m}
      onClick={() => kies(m)}
      className={`h-7 rounded-full px-3 text-[12px] font-bold transition ${
        modus === m ? (licht ? "bg-brand-500 text-white" : "bg-white text-ink") : licht ? "text-ink hover:bg-paper-soft" : "text-white/80 hover:text-white"
      }`}
    >
      {naam}
    </button>
  );
  return (
    <div role="group" aria-label={t.shopZakelijk.modusLabel} className={`inline-flex shrink-0 items-center rounded-full p-0.5 ${licht ? "bg-paper-soft" : "bg-white/10"}`}>
      {knop("particulier", t.shopZakelijk.particulier)}
      {knop("zakelijk", t.shopZakelijk.zakelijk)}
    </div>
  );
}

/** De zoekbalk: een gewoon GET-formulier naar /shop, dus het werkt ook zonder JavaScript. */
function SearchForm({ t, id }: { t: Dict; id: string }) {
  return (
    <form role="search" action="/shop#collectie" method="get" className="flex h-11 w-full overflow-hidden rounded-lg bg-white text-ink ring-brand-mint focus-within:ring-2">
      <select name="cat" aria-label={t.shop.searchIn} defaultValue="" className="hidden max-w-[11rem] shrink-0 border-r border-hair bg-paper-soft px-3 text-[13px] font-semibold text-ink outline-none lg:block">
        <option value="">{t.shop.allCategories}</option>
        {CATS.map((c) => (
          <option key={c} value={c}>
            {c === "Werk & PBM" ? t.shop.navPbm : c === "Kleding" ? t.shop.navKleding : c === "Werkdag" ? t.shop.navWerkdag : t.shop.navTeams}
          </option>
        ))}
      </select>
      <label htmlFor={id} className="sr-only">
        {t.shop.search}
      </label>
      <input id={id} name="q" type="search" maxLength={60} placeholder={t.shop.searchPlaceholder} className="min-w-0 flex-1 bg-transparent px-3.5 text-[15px] text-ink outline-none placeholder:text-neutralx-500" />
      <button type="submit" aria-label={t.shop.search} className="grid w-12 shrink-0 place-items-center bg-brand-mint text-ink transition hover:brightness-95">
        <IconSearch />
      </button>
    </form>
  );
}

function HeaderLink({ href, label, badge = 0, className = "flex", children }: { href: string; label: string; badge?: number; className?: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={badge > 0 ? `${label} (${badge})` : label} className={`relative ${className} h-11 items-center gap-2 rounded-lg px-2 transition hover:bg-white/10 sm:px-2.5`}>
      {children}
      <span className="hidden text-[13px] font-semibold xl:inline">{label}</span>
      {badge > 0 && <span className="absolute left-6 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-mint px-1 text-[11px] font-bold text-ink">{badge}</span>}
    </Link>
  );
}

function ServicePoint({ children, className = "", wrap = false }: { children: ReactNode; className?: string; wrap?: boolean }) {
  return (
    <li className={`flex items-center gap-1.5 ${wrap ? "" : "whitespace-nowrap"} ${className}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand-mint" aria-hidden>
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
      {children}
    </li>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="text-[13px] font-bold">{title}</p>
      <ul className="mt-3 space-y-2 text-[13px]">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="text-white/75 transition hover:text-white hover:underline">
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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </svg>
  );
}
function IconHeartLine() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7.5-4.6-10-9.1C.5 8.6 2 5 5.6 5 8 5 10 6.5 12 9c2-2.5 4-4 6.4-4C22 5 23.5 8.6 22 11.9 19.5 16.4 12 21 12 21z" />
    </svg>
  );
}
function IconCart({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
