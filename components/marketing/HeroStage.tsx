"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HERO_KEUZES, HERO_KEUZE_VOLGORDE, type HeroKeuze } from "@/lib/marketing/hero-keuze";

/**
 * Immersive homepage hero. Dark aurora backdrop, fluid headline, a real photo
 * with a light scroll-parallax and a floating glass "live match" card. Purely
 * presentational — no data, no side effects beyond a passive scroll listener.
 */
export interface HeroContent {
  eyebrow: string;
  titleLine1: string;
  titleLine2: string;
  lead: string;
  ctaPrimary: string;
  ctaSecondary: string;
}
const HERO_DEFAULTS: HeroContent = {
  eyebrow: "Personeel · website · branchesoftware · administratie",
  titleLine1: "Zeker van je werk.",
  titleLine2: "Zeker van je mensen.",
  lead: "Eén plek voor je hele bedrijf: personeel, een eigen website, software voor jouw branche en je administratie. Zoek je werk? Hier vind je diensten bij jou in de buurt.",
  ctaPrimary: "Ik zoek werk",
  ctaSecondary: "Ik zoek mensen",
};

export function HeroStage({
  photo,
  content,
}: {
  photo: ReactNode;
  content?: Partial<Record<keyof HeroContent, string | undefined>>;
}) {
  // Overschrijf alleen met echte waarden; leeg of ontbrekend valt terug op de default.
  const c = { ...HERO_DEFAULTS };
  if (content) {
    for (const k of Object.keys(HERO_DEFAULTS) as (keyof HeroContent)[]) {
      const v = content[k];
      if (v !== undefined && v !== "") c[k] = v;
    }
  }
  // De schakelaar bovenaan: zonder keuze de tekst van nu (en aanpasbaar in de Site-ontwerper), na een tik de tekst voor die bezoeker.
  const [keuze, setKeuze] = useState<HeroKeuze | null>(null);
  const v = keuze ? HERO_KEUZES[keuze] : null;
  const cms = (key: string) => (v ? {} : { "data-cms-key": key });
  const artRef = useRef<HTMLDivElement | null>(null);
  const glassRef = useRef<HTMLDivElement | null>(null);
  const cueRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (artRef.current) artRef.current.style.transform = `translate3d(0, ${y * -0.06}px, 0)`;
        if (glassRef.current) glassRef.current.style.transform = `translate3d(0, ${y * 0.08}px, 0)`;
        if (cueRef.current) cueRef.current.style.opacity = String(Math.max(0, 1 - y / 260));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="relative isolate overflow-hidden hero-ink text-white">
      <div className="aurora" aria-hidden />
      <div className="shell-4k relative grid min-h-[92vh] items-center gap-12 py-12 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-28 2xl:min-h-[88vh]">
        <div className="reveal" data-shown="true">
          {/* keuzeschakelaar: boven de bovenregel; tik nog eens op de gekozen knop om terug te gaan */}
          <div role="group" aria-label="Wat zoek je?" className="mb-6 flex w-full rounded-full bg-white/10 p-1 sm:inline-flex sm:w-auto">
            {HERO_KEUZE_VOLGORDE.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={keuze === k}
                onClick={() => setKeuze((nu) => (nu === k ? null : k))}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition sm:flex-none sm:px-5 ${
                  keuze === k ? "bg-brand-mint text-ink" : "text-white/80 hover:text-white"
                }`}
              >
                {HERO_KEUZES[k].knop}
              </button>
            ))}
          </div>
          <p className="eyebrow text-brand-mint" {...cms("hero.eyebrow")}>{v ? v.eyebrow : c.eyebrow}</p>
          <h1 className="fluid-hero mt-5 text-balance font-display font-bold">
            <span {...cms("hero.titleLine1")}>{v ? v.titleLine1 : c.titleLine1}</span>
            <br />
            <span className="bg-gradient-to-r from-brand-mint to-[#8FF0C4] bg-clip-text text-transparent" {...cms("hero.titleLine2")}>
              {v ? v.titleLine2 : c.titleLine2}
            </span>
          </h1>
          <p className="fluid-lead mt-7 max-w-xl text-white/70" {...(v ? {} : { "data-cms-key": "hero.lead", "data-cms-ml": "1" })}>{v ? v.lead : c.lead}</p>
          {/* twee duidelijke keuzes; op de telefoon onder elkaar over de hele breedte */}
          <div className="mt-8 grid gap-3 sm:mt-10 sm:flex sm:flex-wrap">
            <Link href={v ? v.ctaPrimary.href : "/register"} className="btn-mint text-base" {...cms("hero.ctaPrimary")}>
              {v ? v.ctaPrimary.label : c.ctaPrimary}
            </Link>
            <Link href={v ? v.ctaSecondary.href : "/voor-bedrijven"} className="btn-ghost-invert text-base" {...cms("hero.ctaSecondary")}>
              {v ? v.ctaSecondary.label : c.ctaSecondary}
            </Link>
          </div>
          {/* snelle acties: in één tik naar wat de meeste bezoekers komen doen */}
          <nav aria-label="Direct naar" className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-1 text-white/55">Direct naar</span>
            {SNEL.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 font-medium text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
              >
                {s.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 hidden flex-wrap items-center gap-x-7 gap-y-2 text-sm text-white/65 sm:flex">
            {(v ? v.punten : ["Werk bij jou in de buurt", "Personeel als het druk is", "Software voor jouw zaak"]).map((t) => (
              <span key={t} className="flex items-center gap-2">
                <Tick /> {t}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          <div ref={artRef} className="relative will-change-transform">
            {photo}
          </div>
          <div
            ref={glassRef}
            className="glass absolute -bottom-6 -left-4 w-[min(21rem,88%)] rounded-2xl p-4 will-change-transform sm:-left-10"
          >
            <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em] text-white/65">
              <span className="whitespace-nowrap">Nieuwe dienst</span>
              <span className="pill whitespace-nowrap bg-[rgba(79,224,160,0.16)] normal-case tracking-normal text-brand-mint">Gematcht in 6 min</span>
            </div>
            <p className="mt-3 text-sm font-semibold">Vakkenvuller · avonddienst</p>
            <p className="text-xs text-white/50">
              Amsterdam-West · vandaag 17:00–22:00 · <span className="whitespace-nowrap">€ 19,50/uur</span>
            </p>
            <div className="mt-3 space-y-1.5">
              {[
                { n: "Noa V.", m: "Silver · 12 min", s: "0,94", top: true },
                { n: "Liam K.", m: "Gold · 21 min", s: "0,89" },
              ].map((c) => (
                <div
                  key={c.n}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                    c.top ? "bg-[rgba(79,224,160,0.14)] ring-1 ring-[rgba(79,224,160,0.35)]" : "bg-white/5"
                  }`}
                >
                  <span>
                    <span className="font-medium">{c.n}</span>
                    <span className="ml-1 text-white/65">{c.m}</span>
                  </span>
                  <span className="num font-mono text-white/70">{c.s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={cueRef}
        className="absolute inset-x-0 bottom-6 hidden justify-center lg:flex"
        aria-hidden
      >
        <span className="flex flex-col items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/60">
          Scroll
          <span className="h-9 w-5 rounded-full border border-white/25">
            <span className="mx-auto mt-1.5 block h-2 w-1 animate-bounce rounded-full bg-white/50" />
          </span>
        </span>
      </div>
    </section>
  );
}

const SNEL = [
  { label: "Open klussen", href: "/klussen" },
  { label: "Klus plaatsen", href: "/klus-plaatsen" },
  { label: "Website-check", href: "/website-check" },
  { label: "Shop", href: "/shop" },
];

function Tick() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="#4FE0A0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
