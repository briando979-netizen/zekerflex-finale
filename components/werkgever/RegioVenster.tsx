"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useId, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { kaartStijl } from "@/lib/kaart/stijl";
import { laadKaartMotor } from "@/components/kaart/motor";
import { BreedVenster } from "@/components/werkgever/BreedVenster";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

// ---------------------------------------------------------------------------
// Het venster "Actieve regio's" (23 nov 2026, naar YoungOnes): waar werkte deze freelancer in de laatste 12 maanden via
// ZekerFlex? Op onze eigen kaart (lib/kaart/stijl.ts, MapLibre + PMTiles van de eigen server, geen dienst van buiten en
// geen sleutel) staat per plaats een groene stip en een blauwe speld op de klus van het bedrijf. De plaatsen staan er ook
// als tekst onder: dat is wat een schermlezer leest, en wat overblijft als de browser geen kaart kan tekenen.
// De punten komen van de server (lib/employer/prestaties-kern.ts, actieveRegios): het midden van de vestigingen in die
// plaats, afgerond op ongeveer een kilometer. Geen adres, geen bedrijfsnaam.
// ---------------------------------------------------------------------------

export interface RegioPunt {
  naam: string;
  lat: number;
  lng: number;
}

/** De blauwe speld van de klus (blauw = gepland, lib/kaart en de kleurregels in AGENTS.md). */
function speld(label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  el.innerHTML = `
    <svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
      <path d="M16 0C7.2 0 0 7 0 15.6 0 27 16 42 16 42s16-15 16-26.4C32 7 24.8 0 16 0z" fill="#2563EB"/>
      <circle cx="16" cy="15.5" r="6" fill="#ffffff"/>
    </svg>`;
  return el;
}

function RegioKaart({ regios, klus, speldLabel }: { regios: RegioPunt[]; klus: { lat: number; lng: number } | null; speldLabel: string }) {
  const t = useT().klusPagina;
  const teksten = useRef(t);
  teksten.current = t;
  const houder = useRef<HTMLDivElement>(null);
  const kaart = useRef<MlMap | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const mod = await laadKaartMotor();
        if (weg || !houder.current) return;
        const map = new mod.Map({
          container: houder.current,
          style: kaartStijl(window.location.origin, "licht", false),
          center: [5.3, 52.15],
          zoom: 6,
          minZoom: 5,
          maxZoom: 13,
          attributionControl: { compact: true },
        });
        kaart.current = map;
        map.addControl(new mod.NavigationControl({ showCompass: false }), "bottom-right");
        if (klus) new mod.Marker({ element: speld(speldLabel), anchor: "bottom" }).setLngLat([klus.lng, klus.lat]).addTo(map);
        map.on("load", () => {
          map.addSource("regios", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: regios.map((r) => ({ type: "Feature" as const, properties: { naam: r.naam }, geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] } })),
            },
          });
          // groen = gedaan: de plaatsen waar gewerkt is, half doorzichtig met een rand, groter naarmate je inzoomt
          map.addLayer({
            id: "regios",
            type: "circle",
            source: "regios",
            paint: {
              "circle-color": "#0E5C4A",
              "circle-opacity": 0.35,
              "circle-stroke-color": "#0E5C4A",
              "circle-stroke-width": 2,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 8, 14, 12, 34],
            },
          });
          const punten: [number, number][] = [...regios.map((r): [number, number] => [r.lng, r.lat]), ...(klus ? [[klus.lng, klus.lat] as [number, number]] : [])];
          const eerste = punten[0];
          if (eerste && punten.length > 1) {
            const grenzen = punten.reduce((g, p) => g.extend(p), new mod.LngLatBounds(eerste, eerste));
            map.fitBounds(grenzen, { padding: 60, maxZoom: 10, duration: 0 });
          } else if (eerste) {
            map.jumpTo({ center: eerste, zoom: 9 });
          }
        });
      } catch (err) {
        setFout(err instanceof Error && /webgl/i.test(err.message) ? teksten.current.kaartWebgl : teksten.current.kaartLaden);
      }
    })();
    return () => {
      weg = true;
      kaart.current?.remove();
      kaart.current = null;
    };
    // de punten veranderen niet zolang het venster open staat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative mt-6 h-[280px] overflow-hidden rounded-lg bg-paper-soft sm:h-[420px] lg:h-[500px]">
      <div ref={houder} className="h-full w-full" />
      {fout && (
        <p role="alert" className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-neutralx-600">
          {fout}
        </p>
      )}
    </div>
  );
}

export function RegioVenster({
  open,
  naam,
  regios,
  klus,
  onSluit,
}: {
  open: boolean;
  /** de naam van de freelancer zoals de rij hem toont */
  naam: string;
  regios: RegioPunt[];
  /** de plek van de klus van het bedrijf, voor de speld */
  klus: { lat: number; lng: number } | null;
  onSluit: () => void;
}) {
  const t = useT().klusPagina;
  const id = useId();
  return (
    <BreedVenster open={open} titelId={`${id}-titel`} titel={t.regioTitel} sluitLabel={t.sluiten} onSluit={onSluit}>
      <RegioKaart regios={regios} klus={klus} speldLabel={t.regioSpeld} />
      <p className="mt-4 text-base leading-relaxed text-neutralx-600">{regios.length === 1 ? fmt(t.regioRegelEen, { naam }) : fmt(t.regioRegel, { naam, n: regios.length })}</p>
      <p className="mt-1 text-sm leading-relaxed text-neutralx-500">{t.regioLegenda}</p>
      <p className="mt-3 text-sm leading-relaxed text-ink">
        <span className="font-semibold">{t.regioPlaatsen}</span> {regios.map((r) => r.naam).join(", ")}
      </p>
      <button type="button" onClick={onSluit} className="btn-ghost mt-6 min-h-11">
        {t.sluiten}
      </button>
    </BreedVenster>
  );
}
