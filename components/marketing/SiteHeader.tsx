"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoGlyph } from "@/components/brand/Logo";
import { MobileMenu } from "@/components/marketing/MobileMenu";
import {
  AANBOD_KOLOMMEN,
  VOORBEELDSITES,
  eigenLinks,
  isExternal,
  startHref,
  type Audience,
  type MenuItem,
  type MenuVariant,
} from "@/lib/marketing/site-nav";
import { bouwNav, type Hoofdmenu } from "@/lib/ontwerp/hoofdmenu";

const STORE_KEY = "zf-audience";
const MOBIEL_MENU_ID = "mobiel-menu";

/** hoofdmenu: de eigen versie uit de Site-ontwerper (tabblad Menu); zonder = het standaardmenu (lib/marketing/site-nav.ts) */
export function SiteHeader({ hoofdmenu = null }: { hoofdmenu?: Hoofdmenu | null }) {
  const NAV = bouwNav(hoofdmenu);
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
  const audience: Audience = pathname.startsWith("/voor-bedrijven")
    ? "bedrijven"
    : pathname.startsWith("/voor-freelancers")
      ? "werknemers"
      : stored ?? "werknemers";

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
      className={`sticky top-0 z-50 text-white transition-shadow duration-300 ${
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
          className="ml-2 hidden items-center gap-3 xl:flex min-[1366px]:ml-6 min-[1366px]:gap-6"
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
                  className={`flex items-center whitespace-nowrap py-2 text-sm font-semibold transition-colors ${
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
                    className="ml-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
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
                      n.mega ? "w-[min(60rem,calc(100vw-18rem))]" : "w-[30rem]"
                    }`}
                  >
                    {n.mega ? <AanbodUitklap extra={eigenLinks(n, audience)} /> : <GewoneUitklap variant={variant} />}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* audience toggle */}
        <div className="ml-auto hidden items-center rounded-full border border-white/15 bg-white/[0.06] p-1 min-[1600px]:flex">
          <Link
            href="/voor-freelancers"
            onClick={() => pick("werknemers")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              audience === "werknemers" ? "bg-white/[0.12] text-white" : "text-white/65 hover:text-white/80"
            }`}
          >
            Werknemers
          </Link>
          <Link
            href="/voor-bedrijven"
            onClick={() => pick("bedrijven")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              audience === "bedrijven" ? "bg-white/[0.12] text-white" : "text-white/65 hover:text-white/80"
            }`}
          >
            Bedrijven
          </Link>
        </div>

        <div className="ml-auto hidden items-center gap-3 xl:flex min-[1600px]:ml-0">
          <Link
            href="/login"
            className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-bold text-ink transition hover:bg-white/90"
          >
            Inloggen
          </Link>
          <Link
            href={startHref(audience)}
            className="whitespace-nowrap rounded-full bg-brand-mint px-4 py-2 text-sm font-bold text-ink transition hover:brightness-105"
          >
            Start vandaag
          </Link>
        </div>

        {/* telefoon/tablet: inloggen altijd binnen handbereik, naast de menuknop */}
        <div className="ml-auto flex items-center gap-2 xl:hidden">
          {!open && (
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full bg-white px-3.5 py-2 text-sm font-bold text-ink transition hover:bg-white/90 max-[359px]:hidden"
            >
              Inloggen
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

      {open && <MobileMenu id={MOBIEL_MENU_ID} nav={NAV} audience={audience} onAudience={pick} onClose={sluitMobiel} />}
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
function AanbodUitklap({ extra }: { extra: MenuItem[] }) {
  return (
    <>
      <p className="px-3 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-mint">
        Alles onder één dak
      </p>
      <div className="grid grid-cols-4 gap-1">
        {AANBOD_KOLOMMEN.map((k) => (
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
              {k.sleutel === "online" && (
                <li>
                  <Link href={VOORBEELDSITES.href} className="block rounded-lg py-1 text-[13px] text-white/80 transition-colors hover:text-white">
                    {VOORBEELDSITES.label}
                  </Link>
                </li>
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
