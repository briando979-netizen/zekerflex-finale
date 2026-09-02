"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Immersive homepage hero. Dark aurora backdrop, fluid headline, a real photo
 * with a light scroll-parallax and a floating glass "live match" card. Purely
 * presentational — no data, no side effects beyond a passive scroll listener.
 */
export function HeroStage({ photo }: { photo: ReactNode }) {
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
      <div className="shell-4k relative grid min-h-[92vh] items-center gap-16 py-24 lg:grid-cols-[1.05fr_0.95fr] lg:py-28 2xl:min-h-[88vh]">
        <div className="reveal" data-shown="true">
          <p className="eyebrow text-brand-mint">Nederlands · onafhankelijk · lokaal gehost</p>
          <h1 className="fluid-hero mt-5 text-balance font-display font-bold">
            Zeker van je werk.
            <br />
            <span className="bg-gradient-to-r from-brand-mint to-[#8FF0C4] bg-clip-text text-transparent">
              Zeker van je mensen.
            </span>
          </h1>
          <p className="fluid-lead mt-7 max-w-xl text-white/70">
            Het platform waar werknemers en werkgevers elkaar vinden. Slim gematcht op
            reistijd en vakmanschap, met de optie om dezelfde dag uitbetaald te worden, en
            volledig Wet DBA-proof — zonder tussenpartijen.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/register" className="btn-mint text-base">
              Ik zoek werk
            </Link>
            <Link href="/voor-bedrijven" className="btn-ghost-invert text-base">
              Ik zoek mensen
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-2 text-sm text-white/45">
            {["Bepaal je eigen uurtarief", "Kies je eigen klussen", "Bouw aan jouw toekomst"].map((t) => (
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
            className="glass absolute -bottom-6 -left-4 w-[min(20rem,80%)] rounded-2xl p-4 will-change-transform sm:-left-10"
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/45">
              <span>Nieuwe dienst</span>
              <span className="pill bg-[rgba(79,224,160,0.16)] text-brand-mint">Gematcht in 6 min</span>
            </div>
            <p className="mt-3 text-sm font-semibold">Vakkenvuller · avonddienst</p>
            <p className="text-xs text-white/50">Amsterdam-West · vandaag 17:00–22:00 · € 19,50/uur</p>
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
                    <span className="ml-1 text-white/45">{c.m}</span>
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
        className="absolute inset-x-0 bottom-6 flex justify-center"
        aria-hidden
      >
        <span className="flex flex-col items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/35">
          Scroll
          <span className="h-9 w-5 rounded-full border border-white/25">
            <span className="mx-auto mt-1.5 block h-2 w-1 animate-bounce rounded-full bg-white/50" />
          </span>
        </span>
      </div>
    </section>
  );
}

function Tick() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="#4FE0A0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
