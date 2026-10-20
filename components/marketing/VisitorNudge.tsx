"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { pingNudge } from "@/components/analytics/AnalyticsBeacon";

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

type Kind = "bedrijf" | "werk" | "exit";
const DONE_KEY = "zf_nudge_done";

const COMPANY = /^\/(voor-bedrijven|prijzen|personeel-inhuren|demo)(\/|$)/;
const WORK = /^\/($|klussen|freelance-werk|voor-freelancers|uitzendbureau)/;

type Copy = { title: string; body: string; cta: string; href: string };
const COPY: Record<string, Record<Kind, Copy>> = {
  nl: {
    bedrijf: { title: "Vandaag nog iemand nodig?", body: "Plaats gratis een klus — geverifieerde flexkrachten in de buurt zien hem direct. Je betaalt alleen € 3,50 per gewerkt uur.", cta: "Gratis klus plaatsen", href: "/register?type=bedrijf" },
    werk: { title: "Er wachten klussen op je", body: "Maak in 2 minuten een gratis account en reageer direct. Je kiest zelf hoe snel je wordt uitbetaald.", cta: "Gratis account maken", href: "/register?type=freelancer" },
    exit: { title: "Nog even, voor je gaat…", body: "Werken via ZekerFlex is gratis — ook zonder KVK, via ons uitzendbureau met wekelijks loon.", cta: "Bekijk open klussen", href: "/klussen" },
  },
  en: {
    bedrijf: { title: "Need someone today?", body: "Post a job for free — verified flex workers nearby see it right away. You only pay € 3.50 per hour worked.", cta: "Post a job for free", href: "/register?type=bedrijf" },
    werk: { title: "Jobs are waiting for you", body: "Create a free account in 2 minutes and react right away. You choose how fast you get paid.", cta: "Create free account", href: "/register?type=freelancer" },
    exit: { title: "One moment before you go…", body: "Working through ZekerFlex is free — even without a KVK, via our agency with weekly pay.", cta: "See open jobs", href: "/klussen" },
  },
  pl: {
    bedrijf: { title: "Potrzebujesz kogoś dziś?", body: "Dodaj zlecenie za darmo — zweryfikowani pracownicy w okolicy zobaczą je od razu. Płacisz tylko € 3,50 za przepracowaną godzinę.", cta: "Dodaj zlecenie", href: "/register?type=bedrijf" },
    werk: { title: "Czekają na ciebie zlecenia", body: "Załóż darmowe konto w 2 minuty i od razu się zgłoś. Sam wybierasz, jak szybko dostajesz wypłatę.", cta: "Załóż darmowe konto", href: "/register?type=freelancer" },
    exit: { title: "Chwilka, zanim wyjdziesz…", body: "Praca przez ZekerFlex jest darmowa — także bez KVK, przez naszą agencję z cotygodniową wypłatą.", cta: "Zobacz zlecenia", href: "/klussen" },
  },
  ro: {
    bedrijf: { title: "Ai nevoie de cineva azi?", body: "Publică gratuit un job — lucrătorii verificați din zonă îl văd imediat. Plătești doar € 3,50 pe oră lucrată.", cta: "Publică un job", href: "/register?type=bedrijf" },
    werk: { title: "Te așteaptă joburi", body: "Creează un cont gratuit în 2 minute și aplică imediat. Tu alegi cât de repede ești plătit.", cta: "Creează cont gratuit", href: "/register?type=freelancer" },
    exit: { title: "O clipă, înainte să pleci…", body: "Munca prin ZekerFlex este gratuită — și fără KVK, prin agenția noastră, cu plată săptămânală.", cta: "Vezi joburile", href: "/klussen" },
  },
  uk: {
    bedrijf: { title: "Потрібна людина вже сьогодні?", body: "Розмісти роботу безкоштовно — перевірені працівники поруч побачать її одразу. Платиш лише € 3,50 за відпрацьовану годину.", cta: "Розмістити роботу", href: "/register?type=bedrijf" },
    werk: { title: "На тебе чекає робота", body: "Створи безкоштовний акаунт за 2 хвилини й одразу відгукуйся. Ти сам обираєш, як швидко отримати виплату.", cta: "Створити акаунт", href: "/register?type=freelancer" },
    exit: { title: "Хвилинку, перш ніж піти…", body: "Робота через ZekerFlex безкоштовна — навіть без KVK, через нашу агенцію з щотижневою оплатою.", cta: "Переглянути роботи", href: "/klussen" },
  },
};

function locale(): string {
  const v = document.cookie.split("; ").find((c) => c.startsWith("zf_locale="))?.split("=")[1];
  return v && COPY[v] ? v : "nl";
}

export function VisitorNudge() {
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
    const page: Kind | null = COMPANY.test(pathname) ? "bedrijf" : WORK.test(pathname) ? "werk" : null;

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
      if (page === "bedrijf" && visibleMs.current >= 35_000) void show("bedrijf");
      if (page === "werk" && visibleMs.current >= 40_000) void show("werk");
    }, 1000);
    const onScroll = () => {
      if (page !== "werk") return;
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
  const c = COPY[lang]![kind];
  return (
    <div className="fixed bottom-5 left-4 z-[70] w-[min(22rem,calc(100vw-2rem))] animate-slide-up-fade sm:left-6" role="dialog" aria-label={c.title}>
      <div className="relative overflow-hidden rounded-2xl bg-ink p-5 text-white shadow-lift ring-1 ring-white/10">
        <div className="aurora opacity-50" aria-hidden />
        <button
          type="button"
          onClick={() => setKind(null)}
          aria-label="Sluiten"
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
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
