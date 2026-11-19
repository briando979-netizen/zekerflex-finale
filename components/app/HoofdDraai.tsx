"use client";

import { useEffect, useRef } from "react";
import { DOEL_HOEK, METER_BOOG, naaldHoek, stopTonen, type DraaiStand } from "@/lib/kyc/gezicht/draai-meter";

// ---------------------------------------------------------------------------
// De uitleg bij de tweede selfie (18 nov 2026): een voorbeeldhoofd dat langzaam opzij draait tot de gevraagde hoek,
// met een pijl, en een meter met een wijzer die live laat zien hoe ver het eigen hoofd gedraaid is, met de markering
// "tot hier". Groen zodra het goed staat. Bij "minder beweging" staat het voorbeeldhoofd stil op de doelhoek.
// Alleen uitleg: de meting en de drempels staan in lib/kyc/gezicht (beweging.ts, draai-meter.ts).
// ---------------------------------------------------------------------------

export interface HoofdDraaiTeksten {
  uitleg: string;
  totHier: string;
  gelukt: string;
  /** het woord in de badge zodra het doel gehaald is */
  stopWoord: string;
  /** op het doel: zo blijven */
  stop: string;
  /** voorbij het doel: iets terug */
  terug: string;
}

/** Het voorbeeldhoofd: een gezicht van voren dat om zijn as draait (perspectief + rotateY), met een pijl erboven. */
function VoorbeeldHoofd({ stil, hoek }: { stil: boolean; hoek: number }) {
  const hoofd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = hoofd.current;
    if (!el || stil || typeof el.animate !== "function") return;
    // rustig heen (naar de doelhoek), even vasthouden, terug, even recht: zo ziet iemand hoe ver en hoe rustig
    const anim = el.animate(
      [
        { transform: "rotateY(0deg)", offset: 0 },
        { transform: `rotateY(${-hoek}deg)`, offset: 0.45 },
        { transform: `rotateY(${-hoek}deg)`, offset: 0.65 },
        { transform: "rotateY(0deg)", offset: 0.9 },
        { transform: "rotateY(0deg)", offset: 1 },
      ],
      { duration: 3600, easing: "ease-in-out", iterations: Infinity },
    );
    return () => anim.cancel();
  }, [stil, hoek]);
  return (
    <div aria-hidden className="relative mx-auto h-[72px] w-[72px]" style={{ perspective: "260px" }}>
      <div ref={hoofd} className="h-full w-full" style={{ transformStyle: "preserve-3d", transform: stil ? `rotateY(${-hoek}deg)` : undefined }}>
        <svg viewBox="0 0 72 72" className="h-full w-full">
          {/* hoofd met oren, ogen, neus en mond: genoeg om de draai te zien */}
          <ellipse cx="10" cy="38" rx="5" ry="7" fill="#f1c9a5" />
          <ellipse cx="62" cy="38" rx="5" ry="7" fill="#f1c9a5" />
          <ellipse cx="36" cy="38" rx="24" ry="29" fill="#f6d3b2" />
          <path d="M14 30 Q36 2 58 30 Q52 14 36 14 Q20 14 14 30 Z" fill="#4a3a30" />
          <ellipse cx="26" cy="38" rx="3.2" ry="3.6" fill="#1e1b18" />
          <ellipse cx="46" cy="38" rx="3.2" ry="3.6" fill="#1e1b18" />
          <path d="M36 40 L33 50 L39 50 Z" fill="#e2b48f" />
          <path d="M28 57 Q36 62 44 57" stroke="#9c5a48" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      {/* de pijl: een boog met een punt, naar de kant waarheen het voorbeeld draait */}
      <svg aria-hidden viewBox="0 0 72 20" className="absolute -top-4 left-0 h-5 w-full">
        <path d="M14 16 Q36 -4 58 12" stroke="#ffffff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M52 6 L58 12 L50 14" stroke="#ffffff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** De meter: een boog met de markeringen "tot hier" links en rechts en een wijzer op de gemeten hoek. */
function Meter({ stand, totHier }: { stand: DraaiStand; totHier: string }) {
  const hoek = naaldHoek(stand.fractie);
  const kleur = stand.goed ? "#22c55e" : stand.teVer ? "#f59e0b" : "#ffffff";
  const rad = (g: number) => ((g - 90) * Math.PI) / 180;
  const punt = (g: number, r: number) => ({ x: 60 + Math.cos(rad(g)) * r, y: 56 + Math.sin(rad(g)) * r });
  const boog = (van: number, tot: number, r: number) => {
    const a = punt(van, r);
    const b = punt(tot, r);
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} A${r} ${r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };
  const streep = (g: number) => {
    const a = punt(g, 40);
    const b = punt(g, 52);
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };
  const naald = punt(hoek, 44);
  return (
    <svg aria-hidden viewBox="0 0 120 64" className="h-16 w-[120px]">
      {/* de boog: wit tot de doelhoek, groen van de doelhoek tot de rand (daar is het goed) */}
      <path d={boog(-METER_BOOG, -DOEL_HOEK, 46)} stroke="#22c55e" strokeOpacity="0.7" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d={boog(-DOEL_HOEK, DOEL_HOEK, 46)} stroke="#ffffff" strokeOpacity="0.45" strokeWidth="6" fill="none" />
      <path d={boog(DOEL_HOEK, METER_BOOG, 46)} stroke="#22c55e" strokeOpacity="0.7" strokeWidth="6" fill="none" strokeLinecap="round" />
      {/* "tot hier" */}
      <path d={streep(-DOEL_HOEK)} stroke="#22c55e" strokeWidth="3" strokeLinecap="round" />
      <path d={streep(DOEL_HOEK)} stroke="#22c55e" strokeWidth="3" strokeLinecap="round" />
      <text x={punt(-DOEL_HOEK, 60).x} y={punt(-DOEL_HOEK, 60).y} fontSize="8" fill="#ffffff" textAnchor="middle">
        {totHier}
      </text>
      <text x={punt(DOEL_HOEK, 60).x} y={punt(DOEL_HOEK, 60).y} fontSize="8" fill="#ffffff" textAnchor="middle">
        {totHier}
      </text>
      {/* de wijzer */}
      <line x1="60" y1="56" x2={naald.x.toFixed(1)} y2={naald.y.toFixed(1)} stroke={kleur} strokeWidth="3.5" strokeLinecap="round" style={{ transition: "all 200ms ease-out" }} />
      <circle cx="60" cy="56" r="4" fill={kleur} />
    </svg>
  );
}

/**
 * Het blok boven in het camerabeeld bij de tweede selfie. `stand` komt elke halve seconde van de live meting;
 * `gelukt` zodra de foto vanzelf gemaakt is. `stil` = minder beweging (voorbeeldhoofd staat stil op de doelhoek).
 */
export function HoofdDraai({ stand, gelukt, stil, teksten }: { stand: DraaiStand; gelukt: boolean; stil: boolean; teksten: HoofdDraaiTeksten }) {
  const goed = gelukt || stand.goed;
  // doel gehaald: een duidelijke STOP (19 nov 2026: de eerste echte pogingen draaiden door tot drie keer het doel)
  const stop = !gelukt && stopTonen(stand);
  const tekst = gelukt ? teksten.gelukt : stand.goed ? teksten.stop : stop ? teksten.terug : teksten.uitleg;
  return (
    <div
      className={`pointer-events-none absolute inset-x-3 top-3 rounded-2xl px-3 pb-2 pt-6 text-center text-white ${goed ? "bg-ok/90" : stop ? "bg-warn/90" : "bg-black/65"}`}
      data-hoofddraai={goed ? "goed" : stand.teVer ? "te-ver" : "draai"}
    >
      <div className="flex items-center justify-center gap-4">
        <VoorbeeldHoofd stil={stil} hoek={32} />
        <Meter stand={stand} totHier={teksten.totHier} />
      </div>
      {stop && <span className="mt-0.5 inline-block rounded-full bg-white px-3.5 py-0.5 text-lg font-extrabold tracking-wider text-ink">{teksten.stopWoord}</span>}
      <p role="status" aria-live="polite" className="mt-1 text-sm font-semibold leading-snug">
        {tekst}
      </p>
    </div>
  );
}
