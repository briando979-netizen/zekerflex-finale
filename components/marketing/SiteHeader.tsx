"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoGlyph } from "@/components/brand/Logo";
import { MobileMenu } from "@/components/marketing/MobileMenu";
import {
  ALLES_ONLINE,
  KOP_KNOPPEN,
  VOORBEELDSITES,
  eigenLinks,
  isExternal,
  zichtbareAanbodKolommen,
  zichtbareNav,
  type Audience,
  type MegaKolom,
  type MenuItem,
  type MenuVariant,
} from "@/lib/marketing/site-nav";
import { bouwNav, type Hoofdmenu } from "@/lib/ontwerp/hoofdmenu";

const STORE_KEY = "zf-audience";
const MOBIEL_MENU_ID = "mobiel-menu";

/**
 * hoofdmenu: de eigen versie uit de Site-ontwerper (tabblad Menu); zonder = het standaardmenu (lib/marketing/site-nav.ts).
 * alleenFlexwerk: vlag `publiek-alleen-flexwerk` (de layout leest hem per request) — aan = de niet-flexwerk-knoppen (shop, apps)
 * en de pijlers online/branche vallen weg.
 */
export function SiteHeader({ hoofdmenu = null, alleenFlexwerk = false }: { hoofdmenu?: Hoofdmenu | null; alleenFlexwerk?: boolean }) {
  const NAV = zichtbareNav(bouwNav(hoofdmenu), alleenFlexwerk);
  const aanbodKolommen = zichtbareAanbodKolommen(alleenFlexwerk);
  const pathname = usePathname() || "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [stored, setStored] = useState<Audience | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (v === "werknemers" || v === "bedrijven") setStored(v);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    setOpen(false);
    setMenu(null);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hover opens/closes the submenu for mouse users; on a touch device (no
  // hover, e.g. iPad landscape where this desktop nav already shows) a tap
  // outside the open menu is the only way to dismiss it, so also listen for
  // that explicitly rather than relying on mouseleave.
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menu]);

  const showMenu = (key: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMenu(key);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMenu(null), 140);
  };
  const toggleMenu = (key: string) => setMenu((m) => (m === key ? null : key));

  // URL wins; otherwise the last explicit choice; default werknemers.
  // Since 11 Nov 2026 the home (/) is the workers' page and /bedrijven the companies' one.
  const audience: Audience =
    pathname.startsWith("/voor-bedrijven") || pathname === "/bedrijven"
      ? "bedrijven"
      : pathname.startsWith("/voor-freelancers") || pathname === "/"
        ? "werknemers"
        : stored ?? "werknemers";

  const knoppen = KOP_KNOPPEN[audience];

  const pick = useCallback((a: Audience) => {
    setStored(a);
    try {
      localStorage.setItem(STORE_KEY, a);
    } catch {
      /* ignore */
    }
  }, []);

  // mobiel menu dicht en de focus terug op de menuknop
  const sluitMobiel = useCallback(() => {
    setOpen(false);
    burgerRef.current?.focus({ preventScroll: true });
  }, []);

  const solid = scrolled || menu || open;

  return (
    <header
      // Open mobiel menu: de hele balk (met het menu erin) boven de bezoekerstip (z-70) en
      // de chatknop (z-50) leggen; de balk is een eigen laag, dus een hoge z-index
      // binnen het menu alleen helpt niet. De cookiebalk (z-90) blijft erboven.
      className={`sticky top-0 ${open ? "z-[85]" : "z-50"} text-white transition-shadow duration-300 ${
        scrolled ? "shadow-[0_10px_30px_-18px_rgba(0,0,0,0.7)]" : ""
      }`}
      style={{
        // --zf-inkt-rgb: de kleur "Donkere vlakken" uit de Site-ontwerper (lib/ontwerp/thema.ts); standaard 12 14 18 = #0C0E12
        background: solid && !open ? "rgb(var(--zf-inkt-rgb, 12 14 18) / 0.94)" : "rgb(var(--zf-inkt-rgb, 12 14 18))",
        backdropFilter: solid && !open ? "blur(10px)" : undefined,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="shell-4k flex h-16 items-center gap-4 lg:h-[68px]">
        <Link href="/" className="flex flex-shrink-0 items-center gap-2.5" aria-label="ZekerFlex home">
          <span className="transition-transform hover:rotate-6">
            <LogoGlyph size={30} tone="light" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">ZekerFlex</span>
        </Link>

        {/* With every label on one line the full bar needs ~1.500px. Below
            1280 the menu button takes over (at 1024 Inloggen fell off-screen),
            1280–1365 gets tighter gaps, and the Werknemers/Bedrijven switch
            only shows from 1600 (at 1536 only ~20px was left, less than a
            Windows scrollbar; the audience still follows the URL and the last
            choice). */}
        <nav
          aria-label="Hoofdnavigatie"
          ref={navRef}
          className="ml-1 hidden items-center gap-0.5 lg:flex xl:ml-2 xl:gap-3 min-[1366px]:ml-6 min-[1366px]:gap-6"
        >
          {NAV.map((n) => {
            const active =
              n.match.startsWith("/") &&
              (pathname === n.match || pathname.startsWith(n.match + "/"));
            const variant = n.menu?.[audience];
            const hasMenu = Boolean(variant?.items.length);
            return (
              <div
                key={n.key}
                className="relative flex items-center"
                onMouseEnter={() => hasMenu && showMenu(n.key)}
                onMouseLeave={() => hasMenu && scheduleClose()}
              >
                <Link
                  href={n.href}
                  onFocus={() => hasMenu && showMenu(n.key)}
                  className={`flex items-center whitespace-nowrap py-2 pl-1.5 text-[13px] font-semibold transition-colors xl:pl-0 xl:text-sm ${
                    active || menu === n.key ? "text-brand-mint" : "text-white/75 hover:text-white"
                  }`}
                >
                  {n.label}
                </Link>
                {hasMenu && (
                  // Separate tap target from the label link above: on a touch
                  // device (no :hover, e.g. iPad landscape where this nav is
                  // already shown) this is the only way to open the submenu
                  // without the label immediately navigating away.
                  <button
                    type="button"
                    onClick={() => toggleMenu(n.key)}
                    aria-label={`${n.label} submenu`}
                    aria-expanded={menu === n.key}
                    className="ml-0.5 grid h-9 w-7 flex-shrink-0 place-items-center rounded-full xl:w-9 text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      className={`transition-transform ${menu === n.key ? "rotate-180" : ""}`}
                      aria-hidden
                    >
                      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}

                {hasMenu && variant && menu === n.key && (
                  <div
                    onMouseEnter={() => showMenu(n.key)}
                    onMouseLeave={scheduleClose}
                    className={`absolute left-0 top-[calc(100%+10px)] z-50 animate-slide-up-fade rounded-2xl border border-white/10 bg-[#0C0E12] p-2 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85)] ${
                      n.mega ? (aanbodKolommen.length <= 2 ? "w-[min(34rem,calc(100vw-2rem))]" : "w-[min(60rem,calc(100vw-18rem))]") : "w-[30rem]"
                    }`}
                  >
                    {n.mega ? <AanbodUitklap kolommen={aanbodKolommen} extra={eigenLinks(n, audience)} alleenFlexwerk={alleenFlexwerk} /> : <GewoneUitklap variant={variant} />}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* audience toggle */}
        {/* de schakelaar Werkers | Bedrijven: zoals bij YoungOnes al vanaf een laptop zichtbaar (met de vlag alleen flexwerk is het menu kort genoeg) */}
        <div className="ml-auto hidden items-center rounded-full border border-white/15 bg-white/[0.06] p-1 lg:flex">
          <Link
            href="/"
            onClick={() => pick("werknemers")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              audience === "werknemers" ? "bg-white/[0.12] text-white" : "text-white/65 hover:text-white/80"
            }`}
          >
            Werkers
          </Link>
          <Link
            href="/bedrijven"
            onClick={() => pick("bedrijven")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              audience === "bedrijven" ? "bg-white/[0.12] text-white" : "text-white/65 hover:text-white/80"
            }`}
          >
            Bedrijven
          </Link>
        </div>

        {/* per kant (KOP_KNOPPEN): werkers naar de app, bedrijven inloggen of aanmelden — zoals YoungOnes */}
        <div className="ml-auto hidden items-center gap-2 lg:ml-0 lg:flex xl:gap-3">
          <Link
            href={knoppen.eerste.href}
            className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-[13px] font-bold text-ink transition hover:bg-white/90 xl:px-4 xl:text-sm"
          >
            {knoppen.eerste.label}
          </Link>
          <Link
            href={knoppen.tweede.href}
            className="whitespace-nowrap rounded-full bg-brand-mint px-3 py-2 text-[13px] font-bold text-ink transition hover:brightness-105 xl:px-4 xl:text-sm"
          >
            {knoppen.tweede.label}
          </Link>
        </div>

        {/* telefoon/tablet: de belangrijkste knop altijd binnen handbereik, naast de menuknop */}
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          {!open && (
            <Link
              href={knoppen.mobiel.href}
              className="whitespace-nowrap rounded-full bg-white px-3.5 py-2 text-sm font-bold text-ink transition hover:bg-white/90 max-[359px]:hidden"
            >
              {knoppen.mobiel.label}
            </Link>
          )}
          <button
            ref={burgerRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 transition-colors hover:bg-white/10"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls={MOBIEL_MENU_ID}
          >
            <span aria-hidden className="relative block h-3.5 w-5">
              <span className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ${open ? "translate-y-[6px] rotate-45" : ""}`} />
              <span className={`absolute left-0 top-[6px] h-0.5 w-5 rounded-full bg-current transition-opacity duration-200 ${open ? "opacity-0" : ""}`} />
              <span className={`absolute left-0 top-3 h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ${open ? "-translate-y-[6px] -rotate-45" : ""}`} />
            </span>
          </button>
        </div>
      </div>

      {open && <MobileMenu id={MOBIEL_MENU_ID} nav={NAV} audience={audience} alleenFlexwerk={alleenFlexwerk} onAudience={pick} onClose={sluitMobiel} />}
    </header>
  );
}

/* ───────────────────────────────────────────── uitklappers (desktop) */

function GewoneUitklap({ variant }: { variant: MenuVariant }) {
  return (
    <>
      <p className="px-3 pb-1.5 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-mint">
        {variant.eyebrow}
      </p>
      <ul>
        {variant.items.map((m) => {
          const inner = (
            <>
              <span className="mt-0.5 text-brand-mint transition-transform group-hover:translate-x-0.5">→</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">{m.title}</span>
                <span className="block text-xs leading-snug text-white/55">{m.desc}</span>
              </span>
            </>
          );
          const cls = "group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.06]";
          return (
            <li key={m.href + m.title}>
              {isExternal(m.href) ? (
                <a href={m.href} className={cls}>{inner}</a>
              ) : (
                <Link href={m.href} className={cls}>{inner}</Link>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-white/10 px-3 py-3">
        <span className="text-xs text-white/55">Klaar om te beginnen?</span>
        <Link
          href={variant.cta.href}
          className="rounded-full bg-brand-mint px-3.5 py-1.5 text-xs font-bold text-ink transition hover:brightness-105"
        >
          {variant.cta.label}
        </Link>
      </div>
    </>
  );
}

// "Aanbod": per pijler direct de producten, zodat je in één klik op de juiste
// pagina bent (eerst was het pijler → overzicht → product).
function AanbodUitklap({ kolommen, extra, alleenFlexwerk = false }: { kolommen: MegaKolom[]; extra: MenuItem[]; alleenFlexwerk?: boolean }) {
  return (
    <>
      <p className="px-3 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-mint">
        Alles onder één dak
      </p>
      <div className={`grid gap-1 ${kolommen.length <= 2 ? "grid-cols-2" : "grid-cols-4"}`}>
        {kolommen.map((k) => (
          <div key={k.sleutel} className="min-w-0 rounded-xl p-3">
            <Link href={k.href} className="block text-sm font-bold text-white hover:text-brand-mint">
              {k.naam}
            </Link>
            <p className="mt-1 text-xs leading-snug text-white/50">{k.kort}</p>
            <ul className="mt-3 space-y-0.5 border-t border-white/10 pt-2.5">
              {k.items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className="group flex items-center gap-1.5 rounded-lg py-1 text-[13px] text-white/80 transition-colors hover:text-white"
                  >
                    <span className="min-w-0">{it.naam}</span>
                    {it.binnenkort && (
                      <span className="flex-shrink-0 rounded-full bg-white/10 px-1.5 py-px text-[10px] font-semibold text-white/65">Binnenkort</span>
                    )}
                  </Link>
                </li>
              ))}
              {k.sleutel === "online" && !alleenFlexwerk && (
                <>
                  <li>
                    <Link href={VOORBEELDSITES.href} className="block rounded-lg py-1 text-[13px] text-white/80 transition-colors hover:text-white">
                      {VOORBEELDSITES.label}
                    </Link>
                  </li>
                  <li>
                    <Link href={ALLES_ONLINE.href} className="block rounded-lg py-1 text-[13px] font-semibold text-brand-mint transition-colors hover:text-white">
                      {ALLES_ONLINE.label}
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        ))}
      </div>
      {/* eigen links die de eigenaar in de Site-ontwerper onder Aanbod zette */}
      {extra.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-white/10 px-3 py-2.5">
          {extra.map((m) => (
            <li key={m.href + m.title}>
              {isExternal(m.href) ? (
                <a href={m.href} className="text-[13px] font-semibold text-white/85 hover:text-brand-mint">{m.title}</a>
              ) : (
                <Link href={m.href} className="text-[13px] font-semibold text-white/85 hover:text-brand-mint">{m.title}</Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-3 py-3">
        <span className="text-xs text-white/60">
          Zoek je werk?{" "}
          <Link href="/klussen" className="font-semibold text-white hover:text-brand-mint">
            Open klussen
          </Link>{" "}
          ·{" "}
          <Link href="/voor-freelancers" className="font-semibold text-white hover:text-brand-mint">
            Starten als freelancer
          </Link>
        </span>
        <Link
          href="/aanbod"
          className="rounded-full bg-brand-mint px-3.5 py-1.5 text-xs font-bold text-ink transition hover:brightness-105"
        >
          Het hele aanbod
        </Link>
      </div>
    </>
  );
}
