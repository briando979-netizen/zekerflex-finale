"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Homepage hero. In one look: what ZekerFlex is, and two doors — work or people
 * (two choices decide faster than five). A live count of real open klussen
 * proves it's alive; behind it the Netherlands quietly lights up city by city.
 * Light scroll-parallax on the photo and the glass "live match" card.
 */
export function HeroStage({
  photo,
  map,
  openCount,
}: {
  photo: ReactNode;
  /** calm animated background (HeroMap) */
  map?: ReactNode;
  /** real number of open klussen right now */
  openCount?: number;
}) {
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
      {map && (
        <div className="pointer-events-none absolute -left-[12%] top-[2%] h-[96%] w-[min(48rem,110vw)] text-white opacity-30 [mask-image:radial-gradient(ellipse_at_30%_55%,black_35%,transparent_75%)] sm:-left-[4%] lg:opacity-45" aria-hidden>
          {map}
        </div>
      )}
      <div className="shell-4k relative grid items-center gap-14 pb-14 pt-8 sm:py-14 lg:min-h-[86vh] lg:grid-cols-[1.1fr_0.9fr] lg:py-16 2xl:min-h-[82vh]">
        <div className="reveal" data-shown="true">
          <p className="eyebrow hidden text-brand-mint sm:block">Zeker van je werk · zeker van je mensen</p>
          <h1 className="text-balance font-display text-[clamp(2.1rem,1.2rem+2.9vw,4rem)] font-bold leading-[1.04] tracking-tight sm:mt-5">
            Klussen vinden of mensen inplannen.{" "}
            <span className="bg-gradient-to-r from-brand-mint to-[#8FF0C4] bg-clip-text text-transparent">
              In heel Nederland, zeker geregeld.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Freelancers, flexwerkers en uitzendkrachten vinden werk in de buurt en kiezen zelf hoe snel ze betaald worden.
            <span className="hidden sm:inline"> Bedrijven plannen geverifieerde mensen in voor € 3,50 per gewerkt uur — Wet DBA-proof, zonder abonnement.</span>
          </p>

          {typeof openCount === "number" && openCount > 0 && (
            <Link href="/klussen" className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-sm text-white/80 ring-1 ring-white/10 transition hover:bg-white/10">
              <span className="live-dot" aria-hidden />
              <span>
                <strong className="font-semibold text-white">{openCount}</strong> open klus{openCount === 1 ? "" : "sen"} — nu live
              </span>
              <span aria-hidden className="text-brand-mint">→</span>
            </Link>
          )}

          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
            <Link
              href="/register?type=freelancer"
              className="group rounded-2xl bg-brand-mint p-5 text-ink shadow-glow transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-12px_rgba(79,224,160,0.6)]"
            >
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink/60">Ik zoek werk</span>
              <span className="mt-1.5 block font-display text-lg font-bold leading-snug">Vind een klus in de buurt</span>
              <span className="mt-1 block text-sm text-ink/70">Gratis · ook zonder KVK</span>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold">
                Start gratis <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </span>
            </Link>
            <Link
              href="/register?type=bedrijf"
              className="group rounded-2xl bg-white/[0.07] p-5 text-white ring-1 ring-white/15 backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.11]"
            >
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Ik zoek mensen</span>
              <span className="mt-1.5 block font-display text-lg font-bold leading-snug">Plaats een klus</span>
              <span className="mt-1 block text-sm text-white/65">€ 3,50 per gewerkt uur</span>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-mint">
                Mensen inplannen <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </span>
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/60">
            {["Geverifieerd (KVK + ID)", "Zelf je uitbetaling kiezen", "Geen facturen sturen"].map((t) => (
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
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/65">
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
        className="absolute inset-x-0 bottom-6 flex justify-center"
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

function Tick() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="#4FE0A0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
