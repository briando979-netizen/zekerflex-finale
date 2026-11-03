"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { kaartStijl, NL_GRENZEN } from "@/lib/kaart/stijl";
import type { Punt } from "@/lib/kaart/geo";
import { laadKaartMotor } from "@/components/kaart/motor";

// Een kleine kaart met één gereden route (bijvoorbeeld de lesroute in de
// leerling-app): de lijn, een groene start en een rode finish, ingezoomd op de
// route. Twee vingers om te schuiven, zodat de pagina gewoon scrolt.
// Laad dit onderdeel met next/dynamic, zodat de kaartmotor pas komt als iemand
// de route wil zien.

export default function RouteKaart({ punten, kleur = "#FF5F1F", className = "" }: { punten: Punt[]; kleur?: string; className?: string }) {
  const houder = useRef<HTMLDivElement>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let map: MlMap | null = null;
    let weg = false;
    void (async () => {
      try {
        const mod = await laadKaartMotor();
        if (weg || !houder.current || punten.length < 2) return;
        const grenzen = punten.reduce((b, p) => b.extend(p), new mod.LngLatBounds(punten[0]!, punten[0]!));
        map = new mod.Map({
          container: houder.current,
          style: kaartStijl(window.location.origin, "licht", false),
          bounds: grenzen,
          fitBoundsOptions: { padding: 32, maxZoom: 17 },
          maxBounds: NL_GRENZEN,
          cooperativeGestures: true,
          attributionControl: { compact: true },
          locale: { "CooperativeGesturesHandler.MobileHelpText": "Gebruik twee vingers om de kaart te bewegen", "CooperativeGesturesHandler.WindowsHelpText": "Houd Ctrl ingedrukt om te zoomen" },
        });
        map.addControl(new mod.NavigationControl({ showCompass: false }), "top-right");
        map.on("style.load", () => {
          if (!map) return;
          map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: punten } } });
          map.addLayer({ id: "route-rand", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8 } });
          map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": kleur, "line-width": 5 } });
        });
        new mod.Marker({ color: "#16a34a" }).setLngLat(punten[0]!).addTo(map);
        new mod.Marker({ color: "#dc2626" }).setLngLat(punten[punten.length - 1]!).addTo(map);
      } catch {
        setFout("De kaart kon niet laden.");
      }
    })();
    return () => {
      weg = true;
      map?.remove();
    };
  }, [punten, kleur]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* h-full/w-full: de CSS van MapLibre zet .maplibregl-map op position: relative */}
      <div ref={houder} className="h-full w-full" role="img" aria-label="Kaart met de gereden route" />
      {fout && (
        <p role="alert" className="absolute inset-0 grid place-items-center bg-paper-soft text-sm">
          {fout}
        </p>
      )}
    </div>
  );
}
