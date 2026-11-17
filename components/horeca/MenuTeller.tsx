"use client";

import { useEffect, useState } from "react";

/**
 * Het tellertje achter "Bestellingen" in het menu van het horecadashboard: hoeveel bestellingen wachten op de zaak
 * (de kolom Nieuw van het bord). Ververst elke 30 seconden, alleen als het tabblad in beeld is. Geeft de server geen
 * gewoon antwoord (uitgelogd, geen toegang), dan stopt hij: zo ontstaat er nooit een reeks foutantwoorden.
 */
export function HorecaMenuTeller({ tekst }: { tekst: string }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let gestopt = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      gestopt = true;
      if (timer) clearInterval(timer);
    };
    const haal = async () => {
      if (gestopt || document.hidden) return;
      try {
        const res = await fetch("/api/horeca/beheer?alleen=teller", { cache: "no-store" });
        if (!res.ok) return stop();
        const j = (await res.json()) as { nieuw?: unknown };
        if (!gestopt) setN(typeof j.nieuw === "number" && j.nieuw > 0 ? Math.min(99, Math.floor(j.nieuw)) : 0);
      } catch {
        // even geen verbinding: de volgende ronde probeert het opnieuw
      }
    };
    void haal();
    timer = setInterval(() => void haal(), 30_000);
    const bijTerug = () => void haal();
    document.addEventListener("visibilitychange", bijTerug);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", bijTerug);
    };
  }, []);

  if (n === 0) return null;
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-warn px-1.5 text-[11px] font-bold leading-none text-white" aria-label={`${n} ${tekst}`}>
      {n}
    </span>
  );
}
