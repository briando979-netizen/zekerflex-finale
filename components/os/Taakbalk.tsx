"use client";

import { useEffect, useState } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { tintVanApp as tintVan, type OsApp } from "@/lib/os/apps";
import { OsGlyph, OsIcoonVak } from "@/components/os/Iconen";
import type { VensterStaat } from "@/components/os/Venster";

// ---------------------------------------------------------------------------
// De taakbalk onderaan ZekerFlex OS: de startknop, de vensters die open staan,
// de klok (altijd Nederlandse tijd) en de knoppen voor instellingen en
// afsluiten. De begintijd komt van de server, zodat de pagina niet knippert.
// ---------------------------------------------------------------------------

function Klok({ start }: { start: string }) {
  const [tijd, setTijd] = useState(start);
  useEffect(() => {
    const zet = () => setTijd(new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date()));
    zet();
    const t = window.setInterval(zet, 20_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="px-2 font-mono text-sm tabular-nums text-white/75" title="Nederlandse tijd">
      {tijd}
    </span>
  );
}

export function Taakbalk({
  apps,
  vensters,
  actief,
  startOpen,
  tijd,
  naam,
  onStart,
  onKies,
  onInstellingen,
}: {
  apps: OsApp[];
  vensters: VensterStaat[];
  actief: string | null;
  startOpen: boolean;
  tijd: string;
  naam: string;
  onStart: () => void;
  onKies: (id: string) => void;
  onInstellingen: () => void;
}) {
  const appVan = (id: string) => apps.find((a) => a.id === id);
  return (
    <nav aria-label="Taakbalk" className="absolute inset-x-0 bottom-0 z-50 flex h-14 items-center gap-2 border-t border-white/10 bg-[#0C0E12]/90 px-2 backdrop-blur-xl">
      <button
        type="button"
        onClick={onStart}
        aria-expanded={startOpen}
        aria-label="Alle apps"
        className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${startOpen ? "bg-brand-500 text-ink" : "bg-white/10 text-white hover:bg-white/15"}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <rect x="1" y="1" width="6" height="6" rx="1.5" />
          <rect x="9" y="1" width="6" height="6" rx="1.5" />
          <rect x="1" y="9" width="6" height="6" rx="1.5" />
          <rect x="9" y="9" width="6" height="6" rx="1.5" />
        </svg>
        <span className="hidden sm:inline">Start</span>
      </button>

      <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {vensters.map((v) => {
          const app = appVan(v.id);
          if (!app) return null;
          const open = actief === v.id && !v.minimaal;
          return (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onKies(v.id)}
                aria-current={open ? "true" : undefined}
                className={`flex max-w-[190px] items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition ${open ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10"} ${v.minimaal ? "opacity-60" : ""}`}
              >
                <OsIcoonVak icoon={app.icoon} tint={tintVan(app)} maat="klein" />
                <span className="hidden truncate md:inline">{app.naam}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-shrink-0 items-center gap-1">
        {/* dezelfde meldingen als in de app-schillen, in de donkere stand */}
        <NotificationsBell dark />
        <Klok start={tijd} />
        <button type="button" onClick={onInstellingen} aria-label="Instellingen van het bureaublad" title="Instellingen" className="grid h-9 w-9 place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
          <OsGlyph icoon="instellingen" maat={18} />
        </button>
        <form action={logoutAction}>
          <button type="submit" title={`Afmelden (${naam})`} aria-label={`Afmelden (${naam})`} className="grid h-9 w-9 place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2M19 12H9M16 9l3 3-3 3" />
            </svg>
          </button>
        </form>
      </div>
    </nav>
  );
}
