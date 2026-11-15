"use client";

import { useState } from "react";
import { TEGEL } from "@/lib/kaart/voorbeeld";
import { gebiedVoorTwee, type Punt } from "@/lib/kaart/afstand";

// Het kaartje bij een gedeelde locatie als je eigen plek bekend is, zoals in WhatsApp: de speld van de ander, jij als blauwe
// stip en een stippellijn ertussen, op een zoom waarbij beide passen (lib/kaart/afstand.ts). Tegels van onze eigen route
// /api/kaart/straat (alleen Nederland). Liggen de plekken te ver uit elkaar of laadt de kaart niet, dan toont het niets en
// valt de bubbel terug op het gewone kaartje. Puur decoratief (aria-hidden): de afstand staat er in tekst onder.

/** het kaartje in beeldpunten; de bubbel is smaller of breder, het midden blijft het midden */
const BREEDTE = 260;
const HOOGTE = 160;

export function KaartTweePlekken({ ander, ik, actief = false, jij }: { ander: Punt; ik: Punt; actief?: boolean; jij: string }) {
  const [kapot, setKapot] = useState(false);
  const gebied = gebiedVoorTwee(ander, ik, BREEDTE, HOOGTE);
  if (kapot || !gebied) return null;
  return (
    <span aria-hidden className="relative block h-40 w-full overflow-hidden rounded-lg bg-[#e8ecef]">
      {gebied.tegels.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element -- een kaarttegel van onze eigen route; Next-optimalisatie voegt hier niets toe
        <img
          key={`${t.x}-${t.y}`}
          src={`/api/kaart/straat/${gebied.zoom}/${t.x}/${t.y}`}
          alt=""
          width={TEGEL}
          height={TEGEL}
          loading="lazy"
          draggable={false}
          onError={() => setKapot(true)}
          className="absolute max-w-none select-none"
          style={{ left: `calc(50% + ${t.links}px)`, top: `calc(50% + ${t.boven}px)`, width: TEGEL, height: TEGEL }}
        />
      ))}
      {/* de stippellijn tussen beide plekken */}
      <svg className="absolute left-1/2 top-1/2 overflow-visible" width="1" height="1">
        <line x1={gebied.a.x} y1={gebied.a.y} x2={gebied.b.x} y2={gebied.b.y} stroke="#1d4ed8" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />
      </svg>
      {/* jij: een blauwe stip met een witte rand */}
      <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[#1d4ed8] shadow" style={{ left: `calc(50% + ${gebied.b.x}px)`, top: `calc(50% + ${gebied.b.y}px)` }} />
      <span className="absolute -translate-x-1/2 rounded bg-white/90 px-1 text-[10px] font-semibold text-[#1d4ed8]" style={{ left: `calc(50% + ${gebied.b.x}px)`, top: `calc(50% + ${gebied.b.y + 9}px)` }}>
        {jij}
      </span>
      {/* de ander: de speld, met de punt precies op de plek */}
      <svg viewBox="0 0 24 32" width="24" height="32" className="absolute -translate-x-1/2 -translate-y-full drop-shadow" style={{ left: `calc(50% + ${gebied.a.x}px)`, top: `calc(50% + ${gebied.a.y}px)` }}>
        <path d="M12 0C5.4 0 0 5.2 0 11.6 0 20.6 12 32 12 32s12-11.4 12-20.4C24 5.2 18.6 0 12 0z" fill={actief ? "#16a34a" : "#dc2626"} />
        <circle cx="12" cy="11.6" r="4.6" fill="#fff" />
      </svg>
      <span className="absolute bottom-0.5 right-1 rounded bg-white/70 px-1 text-[9px] text-neutralx-600">© Kadaster</span>
    </span>
  );
}
