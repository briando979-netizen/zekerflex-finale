"use client";

import { useEffect, useState } from "react";
import { useChatTeksten } from "./ChatTekstenContext";
import { isLiveActief, type Plek } from "@/lib/messaging/live-locatie";
import { vulIn } from "@/lib/i18n/vul-in";

// Live locatie in de chat (15 nov 2026), zoals in WhatsApp: de plek schuift mee tot de tijd om is of de afzender stopt.
// Hoe oud de plek is, staat erbij (zojuist / x min geleden), zodat niemand een oude plek voor de echte aanziet. Tijden in
// Nederlandse tijd. De afzender kan stoppen; bijwerken gaat zolang ZekerFlex bij de afzender open is (dat staat er ook).

const TZ = "Europe/Amsterdam";

export function LiveLocatieKaart({ plek, mine, disabled, onStop }: { plek: Plek; mine: boolean; disabled: boolean; onStop?: () => void }) {
  const chat = useChatTeksten();
  const t = chat.bubble;
  const locale = chat.shared.locale;
  // elke 20 s opnieuw tekenen: "x min geleden" en het einde van de deling lopen door zonder nieuw bericht
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => {
    const klok = window.setInterval(() => setNu(Date.now()), 20_000);
    return () => window.clearInterval(klok);
  }, []);
  const live = plek.live;
  if (!live) return null;
  const actief = isLiveActief(live, new Date(nu));
  const klokje = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const minuten = Math.max(0, Math.floor((nu - new Date(live.bijgewerkt).getTime()) / 60_000));
  const hoeOud = minuten < 1 ? t.liveZojuist : vulIn(t.liveMinGeleden, { n: String(minuten) });
  const kaart = `https://www.openstreetmap.org/?mlat=${plek.lat}&mlon=${plek.lng}#map=16/${plek.lat}/${plek.lng}`;

  return (
    <div className="rounded-lg bg-black/[0.04] px-2.5 py-2">
      <a href={kaart} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg hover:bg-black/[0.03]">
        <span aria-hidden className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-white ${actief ? "bg-brand-500" : "bg-neutralx-400"}`}>
          📡
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{t.liveLocatie}</span>
          <span className="block text-[11px] text-neutralx-500">
            {actief ? `${hoeOud} · ${vulIn(t.liveTot, { tijd: klokje(live.tot) })}` : vulIn(t.liveVoorbij, { tijd: klokje(live.bijgewerkt) })}
          </span>
          <span className="block text-[11px] text-neutralx-500">{vulIn(t.openInMap, { coords: `${plek.lat.toFixed(4)}, ${plek.lng.toFixed(4)}` })}</span>
        </span>
      </a>
      {mine && actief && (
        <div className="mt-2 flex items-center gap-2 border-t border-black/10 pt-2">
          <span className="min-w-0 flex-1 text-[11px] text-neutralx-500">{t.liveZolangOpen}</span>
          {onStop && (
            <button type="button" disabled={disabled} onClick={onStop} className="flex-shrink-0 text-xs font-semibold text-crit disabled:opacity-50">
              {t.liveStoppen}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
