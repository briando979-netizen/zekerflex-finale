"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoGlyph } from "@/components/brand/Logo";
import type { Audience } from "@/lib/marketing/site-nav";
import { bouwNav, type Hoofdmenu } from "@/lib/ontwerp/hoofdmenu";

const isExternal = (href: string) => /^(mailto:|tel:|https?:)/.test(href);
const STORE_KEY = "zf-audience";

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

  const pick = (a: Audience) => {
    setStored(a);
    try {
      localStorage.setItem(STORE_KEY, a);
    } catch {
      /* ignore */
    }
  };

  const startHref = audience === "bedrijven" ? "/register?type=bedrijf" : "/register";

  return (
    <header
      className={`sticky top-0 z-50 text-white transition-shadow duration-300 ${
        scrolled ? "shadow-[0_10px_30px_-18px_rgba(0,0,0,0.7)]" : ""
      }`}
      style={{
        // --zf-inkt-rgb: de kleur "Donkere vlakken" uit de Site-ontwerper (lib/ontwerp/thema.ts); standaard 12 14 18 = #0C0E12
        background: scrolled || menu ? "rgb(var(--zf-inkt-rgb, 12 14 18) / 0.94)" : "rgb(var(--zf-inkt-rgb, 12 14 18))",
        backdropFilter: scrolled || menu ? "blur(10px)" : undefined,
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
                    className="absolute left-0 top-[calc(100%+10px)] z-50 w-[30rem] animate-slide-up-fade rounded-2xl border border-white/10 bg-[#0C0E12] p-2 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85)]"
                  >
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
                        const cls =
                          "group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.06]";
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
            href={startHref}
            className="whitespace-nowrap rounded-full bg-brand-mint px-4 py-2 text-sm font-bold text-ink transition hover:brightness-105"
          >
            Start vandaag
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 xl:hidden"
          aria-label="Menu"
          aria-expanded={open}
        >
          <span className="text-lg">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      {/* mobile panel */}
      {open && (
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/10 bg-[#0C0E12] xl:hidden">
          <div className="shell flex flex-col gap-1 py-4">
            <div className="mb-2 flex rounded-full border border-white/15 bg-white/[0.06] p-1">
              <Link
                href="/voor-freelancers"
                onClick={() => pick("werknemers")}
                className={`flex-1 rounded-full px-3 py-1.5 text-center text-sm font-semibold ${
                  audience === "werknemers" ? "bg-white/[0.12] text-white" : "text-white/50"
                }`}
              >
                Werknemers
              </Link>
              <Link
                href="/voor-bedrijven"
                onClick={() => pick("bedrijven")}
                className={`flex-1 rounded-full px-3 py-1.5 text-center text-sm font-semibold ${
                  audience === "bedrijven" ? "bg-white/[0.12] text-white" : "text-white/50"
                }`}
              >
                Bedrijven
              </Link>
            </div>

            {NAV.map((n) => {
              const variant = n.menu?.[audience];
              return (
                <div key={n.key}>
                  <Link
                    href={n.href}
                    className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/[0.06] hover:text-white"
                  >
                    {n.label}
                  </Link>
                  {variant?.items.length ? (
                    <ul className="mb-1 ml-3 border-l border-white/10 pl-3">
                      {variant.items.map((m) => (
                        <li key={m.href + m.title}>
                          {isExternal(m.href) ? (
                            <a href={m.href} className="block rounded-lg px-2 py-2 text-sm text-white/60 hover:text-white">
                              {m.title}
                            </a>
                          ) : (
                            <Link href={m.href} className="block rounded-lg px-2 py-2 text-sm text-white/60 hover:text-white">
                              {m.title}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}

            <div className="mt-3 flex flex-col gap-2">
              <Link href="/login" className="rounded-full bg-white px-4 py-2.5 text-center text-sm font-bold text-ink">
                Inloggen
              </Link>
              <Link href={startHref} className="rounded-full bg-brand-mint px-4 py-2.5 text-center text-sm font-bold text-ink">
                Start vandaag
              </Link>
              <Link href="/app" className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm font-semibold text-white/80">
                Download de app
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
