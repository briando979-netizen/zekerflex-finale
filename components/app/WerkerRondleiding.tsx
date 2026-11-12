"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import {
  RONDLEIDING_KEY,
  RONDLEIDING_START,
  RONDLEIDING_STAPPEN,
  leesRondleidingStand,
  rondleidingBeslissing,
  type RondleidingStand,
} from "@/lib/onboarding/rondleiding";

/** De plek die bij een stap hoort (data-rondleiding), als die zichtbaar is. */
function zoekPlek(stap: string): DOMRect | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-rondleiding="${stap}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

function bewaar(stand: RondleidingStand): void {
  try {
    window.localStorage.setItem(RONDLEIDING_KEY, JSON.stringify(stand));
  } catch {
    // privévenster of geblokkeerde opslag: dan alleen voor nu
  }
}

/**
 * De rondleiding door de werker-app (lib/onboarding/rondleiding.ts): na de eerste sessie één keer vanzelf, daarna
 * via Hulp. Per stap licht de plek in de app op (tabbalk, vraagteken); Volgende, Vorige en Overslaan (ook Escape).
 */
export function WerkerRondleiding() {
  const t = useFT().rondleiding;
  const titelId = useId();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [plek, setPlek] = useState<DOMRect | null>(null);
  const knop = useRef<HTMLButtonElement>(null);
  const stand = useRef<RondleidingStand>({});

  // vanzelf na de eerste sessie, en opnieuw als Hulp erom vraagt
  useEffect(() => {
    let ruw: string | null = null;
    try {
      ruw = window.localStorage.getItem(RONDLEIDING_KEY);
    } catch {
      ruw = null;
    }
    stand.current = leesRondleidingStand(ruw);
    const besluit = rondleidingBeslissing(stand.current, Date.now());
    if (besluit.bewaar) {
      stand.current = besluit.bewaar;
      bewaar(besluit.bewaar);
    }
    if (besluit.toon) setOpen(true);
    const start = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener(RONDLEIDING_START, start);
    return () => window.removeEventListener(RONDLEIDING_START, start);
  }, []);

  const stap = RONDLEIDING_STAPPEN[i] ?? "welkom";

  // de plek van de stap volgen (draaien, scrollen, venstergrootte)
  useEffect(() => {
    if (!open) return;
    const meet = () => setPlek(stap === "welkom" ? null : zoekPlek(stap));
    meet();
    window.addEventListener("resize", meet);
    window.addEventListener("scroll", meet, true);
    return () => {
      window.removeEventListener("resize", meet);
      window.removeEventListener("scroll", meet, true);
    };
  }, [open, stap]);

  useEffect(() => {
    if (open) knop.current?.focus();
  }, [open, i]);

  function sluit() {
    stand.current = { ...stand.current, gezien: true };
    bewaar(stand.current);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") sluit();
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  });

  if (!open) return null;

  const laatste = i === RONDLEIDING_STAPPEN.length - 1;
  const [titel = "", tekst = ""] = t.stappen[stap];
  // de kaart boven de plek als die onderin staat (tabbalk), anders eronder; zonder plek in het midden
  const hoogte = typeof window === "undefined" ? 800 : window.innerHeight;
  const kaartStijl = !plek
    ? { top: "22%" }
    : plek.top > hoogte / 2
      ? { bottom: `${Math.max(12, hoogte - plek.top + 12)}px` }
      : { top: `${Math.min(hoogte - 260, plek.bottom + 12)}px` };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby={titelId}>
      {plek ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl ring-4 ring-brand-500 transition-all duration-200"
          style={{ left: plek.left - 6, top: plek.top - 6, width: plek.width + 12, height: plek.height + 12, boxShadow: "0 0 0 9999px rgba(10,12,16,0.55)" }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgba(10,12,16,0.55)]" />
      )}
      <div className="fixed inset-x-4 mx-auto max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-lift" style={kaartStijl}>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">
          {t.stap.replace("{n}", String(i + 1)).replace("{m}", String(RONDLEIDING_STAPPEN.length))}
        </p>
        <h2 id={titelId} className="mt-1 font-display text-lg font-bold leading-tight text-ink">
          {titel}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{tekst}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={sluit} className="btn-ghost text-sm">
            {t.overslaan}
          </button>
          <span className="flex-1" />
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)} className="btn-ghost text-sm">
              {t.vorige}
            </button>
          )}
          <button ref={knop} type="button" onClick={() => (laatste ? sluit() : setI(i + 1))} className="btn-primary text-sm">
            {laatste ? t.klaar : t.volgende}
          </button>
        </div>
      </div>
    </div>
  );
}
