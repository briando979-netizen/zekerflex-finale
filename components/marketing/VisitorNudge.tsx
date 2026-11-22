"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { pingNudge } from "@/components/analytics/AnalyticsBeacon";
import { COPY, copyKeyVoor, type Kind } from "@/lib/marketing/bezoekerstip";

// ---------------------------------------------------------------------------
// Gentle prompts for visitors without an account — at the moment they're
// clearly interested, never sooner:
//   bedrijf  after ~35s of real reading on a page for companies
//   werk     after ~40s or 65% scrolled on a page about work
//   exit     desktop only, when the mouse heads for the tab bar (about to leave)
// At most one per visit, never in the first 10 seconds, never for someone who
// is logged in, and gone for good once closed. Shown/clicked is counted
// anonymously (Admin → Verkeer & analytics).
// ---------------------------------------------------------------------------

const DONE_KEY = "zf_nudge_done";

// /bedrijven erbij: /voor-bedrijven is daarin samengevoegd (22 nov 2026) en stuurt door
const COMPANY = /^\/(bedrijven|voor-bedrijven|prijzen|personeel-inhuren|demo)(\/|$)/;
const WORK = /^\/($|klussen|freelance-werk|voor-freelancers|uitzendbureau)/;
// Pagina's die sowieso over werk gaan — daar blijft het de "werk"-nudge,
// ongeacht de schakelaar. Op de homepage bepaalt de schakelaar het.
const WORK_EXPLICIT = /^\/(klussen|freelance-werk|voor-freelancers|uitzendbureau)/;
const AUDIENCE_KEY = "zf-audience"; // gedeeld met de koptekst-schakelaar (SiteHeader)

function locale(): string {
  const v = document.cookie.split("; ").find((c) => c.startsWith("zf_locale="))?.split("=")[1];
  return v && COPY[v] ? v : "nl";
}

export function VisitorNudge({ echteKlussen = false }: { echteKlussen?: boolean }) {
  const pathname = usePathname();
  const [kind, setKind] = useState<Kind | null>(null);
  const [lang, setLang] = useState("nl");
  const armedAt = useRef(Date.now());
  const visibleMs = useRef(0);

  useEffect(() => {
    let stopped = false;
    try {
      if (sessionStorage.getItem(DONE_KEY)) return;
    } catch {
      return;
    }
    armedAt.current = Date.now();
    visibleMs.current = 0;
    // Welke nudge hoort hier? Bedrijfspagina's → "bedrijf", expliciete
    // werkpagina's → "werk", en op de homepage volgt het de werknemers/
    // bedrijven-schakelaar uit de koptekst (localStorage "zf-audience").
    const kindForPage = (): Kind | null => {
      if (COMPANY.test(pathname)) return "bedrijf";
      if (WORK_EXPLICIT.test(pathname)) return "werk";
      if (WORK.test(pathname)) {
        let aud: string | null = null;
        try {
          aud = localStorage.getItem(AUDIENCE_KEY);
        } catch {
          /* storage niet beschikbaar */
        }
        return aud === "bedrijven" ? "bedrijf" : "werk";
      }
      return null;
    };

    const show = async (k: Kind) => {
      if (stopped || Date.now() - armedAt.current < 10_000) return;
      if (!document.cookie.includes("zf_cookie_consent=")) return; // never on top of the cookie banner
      stopped = true;
      try {
        if (sessionStorage.getItem(DONE_KEY)) return;
        const s = await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        if (s?.user) return; // logged in: never nudge
        sessionStorage.setItem(DONE_KEY, k);
      } catch {
        return;
      }
      setLang(locale());
      setKind(k);
      pingNudge(k, "shown");
    };

    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      visibleMs.current += 1000;
      const k = kindForPage();
      if (k === "bedrijf" && visibleMs.current >= 35_000) void show("bedrijf");
      if (k === "werk" && visibleMs.current >= 40_000) void show("werk");
    }, 1000);
    const onScroll = () => {
      if (kindForPage() !== "werk") return;
      const doc = document.documentElement;
      if ((window.scrollY + window.innerHeight) / doc.scrollHeight >= 0.65) void show("werk");
    };
    const onLeaveTop = (e: MouseEvent) => {
      if (e.clientY <= 4 && !e.relatedTarget && window.innerWidth >= 1024 && Date.now() - armedAt.current > 12_000) void show("exit");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mouseout", onLeaveTop);
    return () => {
      stopped = true;
      clearInterval(tick);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onLeaveTop);
    };
  }, [pathname]);

  if (!kind) return null;
  const c = COPY[lang]![copyKeyVoor(kind, echteKlussen)];
  return (
    <div className="fixed bottom-5 left-4 z-[70] w-[min(22rem,calc(100vw-2rem))] animate-slide-up-fade sm:left-6" role="dialog" aria-label={c.title}>
      <div className="relative overflow-hidden rounded-2xl bg-ink p-5 text-white shadow-lift ring-1 ring-white/10">
        <div className="aurora opacity-50" aria-hidden />
        {/* z-10: de regels hieronder zijn ook "relative" en lagen anders over het kruisje heen (21 nov 2026: op de telefoon
            kwam een tik nooit aan); 40 px, groot genoeg voor een vinger */}
        <button
          type="button"
          onClick={() => setKind(null)}
          aria-label="Sluiten"
          className="absolute right-2 top-2 z-10 grid h-10 w-10 place-items-center rounded-full text-base text-white/70 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
        <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-mint">
          <span className="live-dot" aria-hidden /> ZekerFlex
        </p>
        <p className="relative mt-2 pr-6 font-display text-lg font-bold leading-snug">{c.title}</p>
        <p className="relative mt-1.5 text-sm leading-relaxed text-white/70">{c.body}</p>
        <Link href={c.href} onClick={() => pingNudge(kind, "click")} className="btn-mint relative mt-4 w-full text-sm">
          {c.cta} →
        </Link>
      </div>
    </div>
  );
}
