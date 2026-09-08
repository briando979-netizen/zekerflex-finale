"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { useShopCart } from "@/components/marketing/useShopCart";

// Gedeelde shop-chrome: promo-balk, brede header met categorie-nav + gecentreerd
// logo + winkelwagen, en de uitgebreide footer. Zit in app/shop/layout.tsx zodat
// elke /shop-pagina dezelfde omlijsting krijgt.

type ApiProduct = {
  id: string;
  slug?: string | null;
  name: string;
  priceCents: number;
  imageUrl?: string | null;
};

const money = (v: number) => `€ ${v.toFixed(2).replace(".", ",")}`;

const MAIN_NAV = [
  { label: "Werk & PBM", cat: "Werk & PBM" },
  { label: "Kleding", cat: "Kleding" },
  { label: "Werkdag", cat: "Werkdag" },
  { label: "Voor teams", cat: "Cadeaus" },
  { label: "Aanbiedingen", cat: "Alles", accent: true },
];

export function ShopChrome({ children }: { children: ReactNode }) {
  const [promo, setPromo] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [catalog, setCatalog] = useState<ApiProduct[]>([]);
  const { cart, add, remove, clear, count } = useShopCart();

  useEffect(() => {
    fetch("/api/shop/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => setCatalog(d.products ?? []))
      .catch(() => undefined);
  }, []);

  const items = useMemo(
    () => catalog.filter((p) => cart[p.id]).map((p) => ({ ...p, qty: cart[p.id]! })),
    [catalog, cart],
  );
  const subtotal = items.reduce((s, p) => s + (p.priceCents / 100) * p.qty, 0);
  const shipping = subtotal >= 50 || subtotal === 0 ? 0 : 4.95;
  const total = subtotal + shipping;

  return (
    <div className="min-h-screen bg-white text-ink">
      {promo && (
        <div className="relative bg-crit text-center text-[13px] font-semibold text-white">
          <p className="px-10 py-2.5">Gratis verzending vanaf € 50 — voor 22:00 besteld, morgen in huis ›</p>
          <button type="button" onClick={() => setPromo(false)} aria-label="Sluiten" className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none text-white/80 hover:text-white">×</button>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-hair bg-white">
        <div className="shell flex items-center justify-between gap-6 py-3.5">
          <nav className="hidden flex-1 items-center gap-5 text-sm font-semibold lg:flex">
            {MAIN_NAV.map((n) => (
              <Link
                key={n.label}
                href={n.cat === "Alles" ? "/shop" : `/shop?cat=${encodeURIComponent(n.cat)}`}
                className={`whitespace-nowrap transition hover:text-brand-600 ${n.accent ? "text-crit" : "text-ink"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <Link href="/shop" className="flex shrink-0 items-center gap-2" aria-label="ZekerFlex Shop">
            <LogoGlyph size={30} tone="dark" />
            <span className="font-display text-xl font-bold tracking-tight">
              ZekerFlex<span className="text-brand-600"> Shop</span>
            </span>
          </Link>

          <div className="flex flex-1 items-center justify-end gap-4">
            <span className="hidden text-xs font-semibold text-neutralx-500 sm:inline">NL</span>
            <Link href="/dashboard" aria-label="Account" className="hover:text-brand-600"><IconUser /></Link>
            <button type="button" onClick={() => setDrawer(true)} aria-label="Winkelwagen" className="relative hover:text-brand-600">
              <IconBag />
              {count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{count}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {children}

      {/* footer */}
      <footer className="border-t border-hair bg-paper-soft">
        <div className="shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <FooterCol title="Hulp & contact" links={["Veelgestelde vragen", "Retourneren", "Verzending", "Betalen op rekening", "Contact opnemen"]} />
          <FooterCol title="Bestellen" links={["Bestelstatus", "Maattabellen", "Cadeaubon", "Zakelijk bestellen", "Bulk & offertes"]} />
          <FooterCol
            title="ZekerFlex"
            links={[
              { label: "Over ZekerFlex", href: "/over-ons" },
              { label: "Werken bij", href: "/werken-bij" },
              { label: "Uitleg in het kort", href: "/uitleg" },
              { label: "Naar het platform", href: "/dashboard" },
            ]}
          />
          <div>
            <p className="text-sm font-bold">Betaal veilig met</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["iDEAL", "Mastercard", "Visa", "PayPal", "Op rekening", "Apple Pay"].map((m) => (
                <span key={m} className="rounded border border-hairstrong bg-white px-2 py-1 text-[11px] font-semibold text-neutralx-600">{m}</span>
              ))}
            </div>
            <p className="mt-5 text-sm font-bold">Bezorging via</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["PostNL", "DHL"].map((m) => (
                <span key={m} className="rounded border border-hairstrong bg-white px-2 py-1 text-[11px] font-semibold text-neutralx-600">{m}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-hair">
          <div className="shell flex flex-col items-center justify-between gap-3 py-5 text-xs text-neutralx-500 sm:flex-row">
            <p>© {new Date().getFullYear()} ZekerFlex · Werk & PBM shop</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/privacy" className="hover:text-ink">Privacyverklaring</Link>
              <Link href="/voorwaarden" className="hover:text-ink">Algemene voorwaarden</Link>
              <button type="button" className="hover:text-ink">Cookie-instellingen</button>
              <Link href="/toegankelijkheid" className="hover:text-ink">Toegankelijkheid</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* winkelwagen-lade */}
      {drawer && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Sluiten" onClick={() => setDrawer(false)} className="absolute inset-0 bg-ink/45" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-hair pb-4">
              <h2 className="font-display text-xl font-bold">Winkelwagen ({count})</h2>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Sluiten" className="grid h-9 w-9 place-items-center rounded-full border border-hair text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              {items.length === 0 ? (
                <div className="py-16 text-center"><LogoGlyph size={44} /><p className="mt-4 font-semibold">Je winkelwagen is leeg.</p></div>
              ) : (
                <div className="space-y-4">
                  {items.map((p) => (
                    <div key={p.id} className="flex gap-3">
                      <div className="h-20 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-paper-soft">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center"><LogoGlyph size={28} /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{p.name}</p>
                        <p className="mt-0.5 text-xs text-neutralx-500">{money(p.priceCents / 100)}</p>
                        <div className="mt-1.5 inline-flex items-center rounded-full border border-hair text-sm">
                          <button type="button" onClick={() => remove(p.id)} className="px-2.5 py-1">−</button>
                          <span className="min-w-6 text-center">{p.qty}</span>
                          <button type="button" onClick={() => add(p.id)} className="px-2.5 py-1">+</button>
                        </div>
                      </div>
                      <p className="text-sm font-semibold">{money((p.priceCents / 100) * p.qty)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {items.length > 0 && (
              <div className="border-t border-hair pt-4">
                <div className="flex justify-between text-sm text-neutralx-600"><span>Subtotaal</span><span>{money(subtotal)}</span></div>
                <div className="mt-1 flex justify-between text-sm text-neutralx-600"><span>Verzending</span><span>{shipping === 0 ? "Gratis" : money(shipping)}</span></div>
                <div className="mt-3 flex justify-between font-display text-lg font-bold"><span>Totaal</span><span>{money(total)}</span></div>
                <button type="button" onClick={() => { setDrawer(false); setCheckout(true); }} className="mt-4 w-full rounded-lg bg-ink py-3 text-sm font-bold text-white">Afrekenen</button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* checkout */}
      {checkout && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/50 px-4 py-8">
          <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-2xl sm:p-9">
            <div className="flex items-start justify-between">
              <h2 className="font-display text-2xl font-bold">Bestelling afronden</h2>
              <button type="button" onClick={() => setCheckout(false)} aria-label="Sluiten" className="grid h-9 w-9 place-items-center rounded-full border border-hair text-xl">×</button>
            </div>
            {ordered ? (
              <div className="py-14 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mintwash text-2xl text-brand-600">✓</div>
                <h3 className="mt-5 font-display text-xl font-bold">Bedankt voor je bestelling.</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-neutralx-600">We hebben je aanvraag ontvangen. De betaalstap wordt gekoppeld zodra de PSP is geconfigureerd.</p>
                <button type="button" onClick={() => { setCheckout(false); setOrdered(false); clear(); }} className="mt-6 rounded-lg bg-ink px-6 py-2.5 text-sm font-bold text-white">Terug naar de shop</button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setOrdered(true); }} className="mt-6 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="field-label">Voornaam<input required className="field-input" /></label>
                  <label className="field-label">Achternaam<input required className="field-input" /></label>
                </div>
                <label className="field-label">E-mailadres<input required type="email" className="field-input" /></label>
                <label className="field-label">Adres<input required className="field-input" /></label>
                <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                  <label className="field-label">Postcode<input required className="field-input" /></label>
                  <label className="field-label">Plaats<input required className="field-input" /></label>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-hair pt-4 font-display text-lg font-bold"><span>Totaal</span><span>{money(total)}</span></div>
                <button className="w-full rounded-lg bg-ink py-3 text-sm font-bold text-white" type="submit">Bestelling plaatsen</button>
                <p className="text-center text-[11px] text-neutralx-400">Betaling volgt via de gekoppelde betaalprovider.</p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: (string | { label: string; href: string })[] }) {
  return (
    <div>
      <p className="text-sm font-bold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-neutralx-600">
        {links.map((l) => {
          const label = typeof l === "string" ? l : l.label;
          const href = typeof l === "string" ? null : l.href;
          return (
            <li key={label}>
              {href ? <Link href={href} className="transition hover:text-ink">{label}</Link> : <button type="button" className="transition hover:text-ink">{label}</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </svg>
  );
}
function IconBag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
