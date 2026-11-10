"use client";

import { useEffect, useState } from "react";
import { ShiftMap } from "@/components/app/ShiftMap";
import { useFT } from "@/components/i18n/useFT";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ROUTE_MODI, isRouteModus, type RouteModus } from "@/lib/geo/route-core";

// ---------------------------------------------------------------------------
// De kaart op de kluspagina met de echte route van je thuisbasis naar de klus:
// auto, fiets of lopen (je keuze blijft in deze browser), over de weg via onze
// eigen routeplanner (/api/me/klus-route, die je thuisbasis zelf uit je profiel
// leest). De route komt pas na het laden van de pagina. Is de routeplanner er
// niet, dan blijft gewoon de schatting staan die de pagina al had, zonder melding.
// ---------------------------------------------------------------------------

const OPSLAG = "zf-klus-vervoer";

/** De sleutels van de vervoerswijzen in het woordenboek (detail.modes). */
const WIJZE_SLEUTEL: Record<RouteModus, "driving" | "bicycling" | "walking"> = {
  auto: "driving",
  fiets: "bicycling",
  lopen: "walking",
};

type KlusRouteLijn = { meters: number; seconds: number; lijn: [number, number][] };

export function KlusRoute({
  klusId,
  lat,
  lng,
  label,
  schatting,
  begin,
}: {
  klusId: string;
  lat: number;
  lng: number;
  label: string;
  /** de schatting die de pagina al had (lib/geo/travel-modes.ts), per vervoerswijze */
  schatting: Record<RouteModus, { minutes: number; km: number }>;
  /** de vervoerswijze waarmee we beginnen als je nog niets koos (de snelste uit de schatting) */
  begin: RouteModus;
}) {
  const ft = useFT();
  const D = ft.detail;
  const { locale } = useI18n();
  const [modus, setModus] = useState<RouteModus>(begin);
  const [gelezen, setGelezen] = useState(false);
  const [route, setRoute] = useState<KlusRouteLijn | null>(null);
  const [bezig, setBezig] = useState(false);

  // je eerdere keuze (pas na het laden: de server kent hem niet, anders botst de eerste weergave)
  useEffect(() => {
    try {
      const bewaard = localStorage.getItem(OPSLAG);
      if (isRouteModus(bewaard)) setModus(bewaard);
    } catch {
      // geen opslag: dan de snelste
    }
    setGelezen(true);
  }, []);

  useEffect(() => {
    if (!gelezen) return;
    const ctl = new AbortController();
    setBezig(true);
    fetch(`/api/me/klus-route?klus=${encodeURIComponent(klusId)}&modus=${modus}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { route?: KlusRouteLijn | null } | null) => setRoute(d?.route && Array.isArray(d.route.lijn) ? d.route : null))
      .catch(() => {
        if (!ctl.signal.aborted) setRoute(null);
      })
      .finally(() => {
        if (!ctl.signal.aborted) setBezig(false);
      });
    return () => ctl.abort();
  }, [klusId, modus, gelezen]);

  function kies(m: RouteModus) {
    setModus(m);
    setRoute(null);
    try {
      localStorage.setItem(OPSLAG, m);
    } catch {
      // geen opslag: de keuze geldt alleen nu
    }
  }

  const minuten = route ? Math.max(1, Math.round(route.seconds / 60)) : schatting[modus].minutes;
  const km = route ? Math.round(route.meters / 100) / 10 : schatting[modus].km;

  return (
    <div>
      <ShiftMap lat={lat} lng={lng} height={180} label={label} routeLijn={route?.lijn ?? null} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-hair bg-white px-3 py-2.5">
        <div role="group" aria-label={D.routeFromHome} className="flex gap-1">
          {ROUTE_MODI.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modus === m}
              onClick={() => kies(m)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                modus === m ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong text-ink hover:bg-paper-soft"
              }`}
            >
              {D.modes[WIJZE_SLEUTEL[m]] ?? m}
            </button>
          ))}
        </div>
        <p className="text-sm" aria-live="polite">
          <span className="num font-semibold text-ink">
            {D.minutes(minuten)} · {km.toLocaleString(locale, { maximumFractionDigits: 1 })} km
          </span>{" "}
          <span className="text-xs text-neutralx-500">{bezig ? D.routeLoading : route ? D.routeByRoad : D.routeEstimate}</span>
        </p>
      </div>
    </div>
  );
}
