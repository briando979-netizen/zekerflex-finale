"use client";

import { useState } from "react";
import { inNederland, tegelsRond, TEGEL, VOORBEELD_ZOOM } from "@/lib/kaart/voorbeeld";

// Het kaartje boven een gedeelde locatie in de chat, zoals in WhatsApp: een stukje straatkaart met een speld op de plek. Samengesteld
// uit 3 bij 3 tegels van /api/kaart/straat (eigen server, zonder WebGL en zonder een externe partij). Buiten Nederland, of als de
// kaart niet laadt, toont het niets: het bericht houdt dan zijn gewone blokje met de gegevens. Puur decoratief (alt leeg); de
// tekst eronder zegt waar het over gaat.

export function KaartVoorbeeld({ lat, lng, actief = false }: { lat: number; lng: number; actief?: boolean }) {
  const [kapot, setKapot] = useState(false);
  if (kapot || !inNederland(lat, lng)) return null;
  return (
    <span aria-hidden className="relative block h-32 w-full overflow-hidden rounded-lg bg-[#e8ecef]">
      {tegelsRond(lat, lng).map((t) => (
        // eslint-disable-next-line @next/next/no-img-element -- een kaarttegel van onze eigen route; Next-optimalisatie voegt hier niets toe
        <img
          key={`${t.x}-${t.y}`}
          src={`/api/kaart/straat/${VOORBEELD_ZOOM}/${t.x}/${t.y}`}
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
      {/* de speld: de punt ligt precies in het midden van het kaartje */}
      <svg viewBox="0 0 24 32" width="26" height="34" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow">
        <path d="M12 0C5.4 0 0 5.2 0 11.6 0 20.6 12 32 12 32s12-11.4 12-20.4C24 5.2 18.6 0 12 0z" fill={actief ? "#16a34a" : "#dc2626"} />
        <circle cx="12" cy="11.6" r="4.6" fill="#fff" />
      </svg>
      <span className="absolute bottom-0.5 right-1 rounded bg-white/70 px-1 text-[9px] text-neutralx-600">© Kadaster</span>
    </span>
  );
}
