"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoGlyph } from "@/components/brand/Logo";

type Audience = "werknemers" | "bedrijven";

interface MenuItem {
  title: string;
  desc: string;
  href: string;
}
interface MenuVariant {
  eyebrow: string;
  cta: { label: string; href: string };
  items: MenuItem[];
}
interface NavEntry {
  key: string;
  href: string;
  label: string;
  match: string;
  menu?: Record<Audience, MenuVariant>;
}

const CTA_WN = { label: "Account aanmaken", href: "/register" };
const CTA_BV = { label: "Organisatie aanmelden", href: "/register?type=bedrijf" };

const OVER_ITEMS: MenuItem[] = [
  { title: "Ons verhaal", desc: "Waarom ZekerFlex bestaat en wat we anders doen.", href: "/over-ons#verhaal" },
  { title: "Drie uitgangspunten", desc: "Onafhankelijk, zeker en lokaal gehost.", href: "/over-ons#uitgangspunten" },
  { title: "Werken bij ons", desc: "Stuur een open sollicitatie — goede mensen zijn altijd welkom.", href: "/over-ons#werken-bij" },
  { title: "Contact", desc: "Vragen of samenwerken? Mail info@zekerflex.com.", href: "mailto:info@zekerflex.com" },
];
const KENNIS_ITEMS: MenuItem[] = [
  { title: "Informatie", desc: "De basis in één oogopslag: wat, voor wie, wat kost het.", href: "/kennis#informatie" },
  { title: "Kennisbank", desc: "Uitgelegde onderwerpen: Wet DBA, StiPP, uitbetaling en meer.", href: "/kennis#kennisbank" },
  { title: "Wet DBA voor bedrijven", desc: "Schijnzelfstandigheid, gezag en handhaving — helder uitgelegd.", href: "/kennis/wet-dba" },
  { title: "Whitepapers", desc: "Belasting, administratie en verzekering — als pdf om te bewaren.", href: "/kennis/whitepapers" },
  { title: "Blogs", desc: "Nieuws en achtergrond over flexibel werk en het platform.", href: "/kennis/blog" },
  { title: "FAQ", desc: "Kort antwoord op de vragen die we het vaakst krijgen.", href: "/kennis/faq" },
];

const NAV: NavEntry[] = [
  {
    key: "hoe",
    href: "/#hoe-het-werkt",
    label: "Hoe het werkt",
    match: "hoe-het-werkt",
    menu: {
      werknemers: {
        eyebrow: "Zo werkt ZekerFlex",
        cta: CTA_WN,
        items: [
          { title: "Vind werk", desc: "Diensten die matchen op je vak, je reistijd en je beschikbaarheid.", href: "/voor-freelancers#matching" },
          { title: "Starten als freelancer", desc: "Van aanmelding tot je eerste dienst — alles geregeld behalve het werk zelf.", href: "/voor-freelancers" },
          { title: "Via het uitzendbureau", desc: "Liever loonstrook, vakantiegeld en pensioen? Werk als uitzendkracht.", href: "/uitzendbureau" },
          { title: "Verzekeren", desc: "Aansprakelijkheid en ongevallen gedekt tijdens elke opdracht.", href: "/voor-freelancers#verzekering" },
        ],
      },
      bedrijven: {
        eyebrow: "Zo werkt ZekerFlex voor bedrijven",
        cta: CTA_BV,
        items: [
          { title: "Voor bedrijven", desc: "Zet een dienst uit — ZekerFlex matcht direct de beste kandidaten.", href: "/voor-bedrijven" },
          { title: "Matching & toewijzing", desc: "Automatisch per vestiging, gewogen op reistijd en betrouwbaarheid.", href: "/voor-bedrijven#matching" },
          { title: "GPS check-in & urengoedkeuring", desc: "Uren goedkeuren in één klik — de facturen volgen vanzelf.", href: "/voor-bedrijven#checkin" },
          { title: "Facturatie & Wet DBA-monitor", desc: "Geaggregeerde facturatie en vroege risicosignalen per samenwerking.", href: "/voor-bedrijven#facturatie" },
          { title: "Helpcentrum voor opdrachtgevers", desc: "Account, PO-nummers, diensten plaatsen en uren goedkeuren — stap voor stap.", href: "/kennis/werkgevers" },
          { title: "Vraag een demo aan", desc: "30 minuten, vrijblijvend — we laten zien hoe het platform werkt.", href: "/demo" },
        ],
      },
    },
  },
  {
    key: "uitzend",
    href: "/uitzendbureau",
    label: "Uitzendbureau",
    match: "/uitzendbureau",
    menu: {
      werknemers: {
        eyebrow: "Werken als uitzendkracht",
        cta: CTA_WN,
        items: [
          { title: "Wat je krijgt", desc: "De verwachtingen vooraf: loon, toeslagen, zekerheid.", href: "/uitzendbureau#verwachtingen" },
          { title: "Het ABU-fasensysteem", desc: "Fase A, B en C — hoe je rechten meegroeien.", href: "/uitzendbureau#fasen" },
          { title: "Drie manieren om te werken", desc: "Uitzendkracht, flexwerker of zzp — je kunt altijd wisselen.", href: "/uitzendbureau#routes" },
          { title: "Alles terug te lezen", desc: "Loonstrook, StiPP, vakantiegeld en fase — elke week in je dashboard.", href: "/uitzendbureau#verloning" },
        ],
      },
      bedrijven: {
        eyebrow: "Inhuren via het uitzendbureau",
        cta: CTA_BV,
        items: [
          { title: "Zo werkt uitzenden", desc: "ZekerFlex is de werkgever; jij huurt zonder gedoe in.", href: "/uitzendbureau" },
          { title: "Geen werkgeversrisico", desc: "Loondoorbetaling, verzuim en cao lopen via ZekerFlex.", href: "/voor-bedrijven#dba" },
          { title: "Facturatie per kostenplaats", desc: "Eén geaggregeerde factuur, uitgesplitst per vestiging.", href: "/voor-bedrijven#facturatie" },
          { title: "Compliance & auditspoor", desc: "Wet DBA-monitor en een logboek van elke handeling.", href: "/voor-bedrijven#dba" },
        ],
      },
    },
  },
  {
    key: "prijzen",
    href: "/prijzen",
    label: "Prijzen",
    match: "/prijzen",
    menu: {
      werknemers: {
        eyebrow: "Eerlijk en voorspelbaar",
        cta: CTA_WN,
        items: [
          { title: "Gratis voor werknemers", desc: "Voor altijd. Meedoen kost je niets.", href: "/prijzen#freelancers" },
          { title: "Sneller uitbetalen", desc: "Direct, binnen 3 dagen of gratis wachten — jij kiest per keer.", href: "/kennis/uitbetaling-en-facturen" },
          { title: "Veelgestelde vragen", desc: "Verborgen kosten, wanneer de fee telt, en meer.", href: "/prijzen#faq" },
        ],
      },
      bedrijven: {
        eyebrow: "Eerlijk en voorspelbaar",
        cta: CTA_BV,
        items: [
          { title: "€ 3,50 per gewerkt uur", desc: "Vaste platformkosten — alleen wanneer er iemand werkt.", href: "/prijzen#bedrijven" },
          { title: "Geen abonnement, geen opstart", desc: "Geen plaatsingskosten, geen staffels om te doorgronden.", href: "/prijzen#bedrijven" },
          { title: "Veelgestelde vragen", desc: "Wanneer de fee telt, offerte op maat, btw.", href: "/prijzen#faq" },
        ],
      },
    },
  },
  {
    key: "over",
    href: "/over-ons",
    label: "Over ons",
    match: "/over-ons",
    menu: {
      werknemers: { eyebrow: "Waar we voor staan", cta: CTA_WN, items: OVER_ITEMS },
      bedrijven: { eyebrow: "Waar we voor staan", cta: CTA_BV, items: OVER_ITEMS },
    },
  },
  {
    key: "kennis",
    href: "/kennis",
    label: "Kennis",
    match: "/kennis",
    menu: {
      werknemers: { eyebrow: "Kennis & informatie", cta: CTA_WN, items: KENNIS_ITEMS },
      bedrijven: { eyebrow: "Kennis & informatie", cta: CTA_BV, items: KENNIS_ITEMS },
    },
  },
];

const isExternal = (href: string) => /^(mailto:|tel:|https?:)/.test(href);
const STORE_KEY = "zf-audience";

export function SiteHeader() {
  const pathname = usePathname() || "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [stored, setStored] = useState<Audience | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const showMenu = (key: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMenu(key);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMenu(null), 140);
  };

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
        background: scrolled || menu ? "rgba(12,14,18,0.94)" : "#0C0E12",
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

        <nav className="ml-6 hidden items-center gap-6 lg:flex">
          {NAV.map((n) => {
            const active =
              n.match.startsWith("/") &&
              (pathname === n.match || pathname.startsWith(n.match + "/"));
            const variant = n.menu?.[audience];
            const hasMenu = Boolean(variant?.items.length);
            return (
              <div
                key={n.key}
                className="relative"
                onMouseEnter={() => hasMenu && showMenu(n.key)}
                onMouseLeave={() => hasMenu && scheduleClose()}
              >
                <Link
                  href={n.href}
                  onFocus={() => hasMenu && showMenu(n.key)}
                  aria-expanded={hasMenu ? menu === n.key : undefined}
                  className={`flex items-center gap-1 py-2 text-sm font-semibold transition-colors ${
                    active || menu === n.key ? "text-brand-mint" : "text-white/75 hover:text-white"
                  }`}
                >
                  {n.label}
                  {hasMenu && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      className={`transition-transform ${menu === n.key ? "rotate-180" : ""}`}
                      aria-hidden
                    >
                      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </Link>

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
        <div className="ml-auto hidden items-center rounded-full border border-white/15 bg-white/[0.06] p-1 lg:flex">
          <Link
            href="/voor-freelancers"
            onClick={() => pick("werknemers")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              audience === "werknemers" ? "bg-white/[0.12] text-white" : "text-white/45 hover:text-white/80"
            }`}
          >
            Werknemers
          </Link>
          <Link
            href="/voor-bedrijven"
            onClick={() => pick("bedrijven")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              audience === "bedrijven" ? "bg-white/[0.12] text-white" : "text-white/45 hover:text-white/80"
            }`}
          >
            Bedrijven
          </Link>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-ink transition hover:bg-white/90"
          >
            Inloggen
          </Link>
          <Link
            href={startHref}
            className="rounded-full bg-brand-mint px-4 py-2 text-sm font-bold text-ink transition hover:brightness-105"
          >
            Start vandaag
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 lg:hidden"
          aria-label="Menu"
          aria-expanded={open}
        >
          <span className="text-lg">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      {/* mobile panel */}
      {open && (
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/10 bg-[#0C0E12] lg:hidden">
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
