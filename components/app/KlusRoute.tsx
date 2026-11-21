"use client";

import { useEffect, useState } from "react";
import { ShiftMap } from "@/components/app/ShiftMap";
import type { RouteModus } from "@/lib/geo/route-core";

// ---------------------------------------------------------------------------
// De kaart op de kluspagina met de echte route van je thuisbasis naar de klus, over de weg via onze eigen routeplanner
// (/api/me/klus-route, die je thuisbasis zelf uit je profiel leest), met de snelste vervoerswijze. De route komt pas na
// het laden van de pagina. Is de routeplanner er niet, dan blijft de kaart zonder lijn, zonder melding.
// Sinds 21 nov (eigenaar: "onder de kaart staat twee keer route berekenen, laat die staan met bekijk reistijd en die andere
// weg") staat hier geen eigen balk met Auto/Fiets/Lopen meer: de reistijden per vervoerswijze staan op de kluspagina onder
// "Bekijk reistijden".
// ---------------------------------------------------------------------------

type KlusRouteLijn = { meters: number; seconds: number; lijn: [number, number][] };

export function KlusRoute({
  klusId,
  lat,
  lng,
  label,
  begin,
}: {
  klusId: string;
  lat: number;
  lng: number;
  label: string;
  /** de vervoerswijze van de lijn op de kaart (de snelste uit de schatting) */
  begin: RouteModus;
}) {
  const [route, setRoute] = useState<KlusRouteLijn | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/me/klus-route?klus=${encodeURIComponent(klusId)}&modus=${begin}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { route?: KlusRouteLijn | null } | null) => setRoute(d?.route && Array.isArray(d.route.lijn) ? d.route : null))
      .catch(() => {
        if (!ctl.signal.aborted) setRoute(null);
      });
    return () => ctl.abort();
  }, [klusId, begin]);

  return <ShiftMap lat={lat} lng={lng} height={180} label={label} routeLijn={route?.lijn ?? null} />;
}
