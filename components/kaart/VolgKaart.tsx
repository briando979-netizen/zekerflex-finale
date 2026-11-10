"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { kaartStijl } from "@/lib/kaart/stijl";
import { laadKaartMotor } from "@/components/kaart/motor";

// ---------------------------------------------------------------------------
// De kaart waarop de klant de ZekerFlex-bus ziet rijden: onze eigen kaart (lib/kaart/stijl.ts), het
// adres als speld, de bus als oranje auto met een richting, en een stippellijn ertussen. De bus
// schuift soepel naar elke nieuwe positie. Geen eigen gegevens in de kaart zelf, alleen twee punten.
// ---------------------------------------------------------------------------

type Punt = { lat: number; lon: number };

function richting(van: Punt, naar: Punt): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const y = Math.sin(r(naar.lon - van.lon)) * Math.cos(r(naar.lat));
  const x = Math.cos(r(van.lat)) * Math.sin(r(naar.lat)) - Math.sin(r(van.lat)) * Math.cos(r(naar.lat)) * Math.cos(r(naar.lon - van.lon));
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** De ZekerFlex-bus van boven gezien, in het oranje van het merk. */
function busElement(): { el: HTMLDivElement; draai: (graden: number) => void } {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "De ZekerFlex-bus");
  el.style.width = "44px";
  el.style.height = "44px";
  el.innerHTML = `
    <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true" style="transition: transform 0.6s ease; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
      <circle cx="22" cy="22" r="20" fill="#ffffff" opacity="0.92"/>
      <rect x="14" y="7" width="16" height="30" rx="5" fill="#FF5F1F"/>
      <rect x="16" y="10" width="12" height="7" rx="2" fill="#1f2937" opacity="0.85"/>
      <rect x="16" y="29" width="12" height="5" rx="2" fill="#1f2937" opacity="0.55"/>
      <rect x="20" y="18" width="4" height="10" rx="1" fill="#ffffff" opacity="0.9"/>
      <rect x="12" y="12" width="3" height="5" rx="1.5" fill="#1f2937"/>
      <rect x="29" y="12" width="3" height="5" rx="1.5" fill="#1f2937"/>
      <rect x="12" y="27" width="3" height="5" rx="1.5" fill="#1f2937"/>
      <rect x="29" y="27" width="3" height="5" rx="1.5" fill="#1f2937"/>
    </svg>`;
  const svg = el.querySelector("svg") as SVGElement;
  return { el, draai: (g) => (svg.style.transform = `rotate(${g}deg)`) };
}

function spijkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Het installatieadres");
  el.innerHTML = `
    <svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
      <path d="M16 0C7.2 0 0 7 0 15.6 0 27 16 42 16 42s16-15 16-26.4C32 7 24.8 0 16 0z" fill="#1D4E89"/>
      <circle cx="16" cy="15.5" r="6" fill="#ffffff"/>
    </svg>`;
  return el;
}

export function VolgKaart({
  bestemming,
  positie,
  className = "",
  interactief = true,
  zoom = 14,
}: {
  bestemming: Punt;
  positie: Punt | null;
  className?: string;
  /** false: een vaste kaart zonder slepen en zoomen, zoals op een kaartje in een lijst (scrollen blijft scrollen) */
  interactief?: boolean;
  zoom?: number;
}) {
  const houder = useRef<HTMLDivElement>(null);
  const kaart = useRef<MlMap | null>(null);
  const bus = useRef<{ marker: Marker; draai: (g: number) => void } | null>(null);
  const vorig = useRef<Punt | null>(null);
  const animatie = useRef<number | null>(null);
  const ml = useRef<typeof import("maplibre-gl") | null>(null);
  const [klaar, setKlaar] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // de kaart zelf, één keer
  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const mod = await laadKaartMotor();
        if (weg || !houder.current) return;
        ml.current = mod;
        const map = new mod.Map({
          container: houder.current,
          style: kaartStijl(window.location.origin, "licht", false),
          center: [bestemming.lon, bestemming.lat],
          zoom,
          minZoom: 5,
          maxZoom: 19,
          interactive: interactief,
          attributionControl: { compact: true },
        });
        kaart.current = map;
        if (interactief) map.addControl(new mod.NavigationControl({ showCompass: false }), "top-right");
        new mod.Marker({ element: spijkerElement(), anchor: "bottom" }).setLngLat([bestemming.lon, bestemming.lat]).addTo(map);
        map.on("load", () => {
          map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
          map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round" }, paint: { "line-color": "#FF5F1F", "line-width": 4, "line-dasharray": [1.5, 1.5] } });
          setKlaar(true);
        });
      } catch (err) {
        setFout(err instanceof Error && /webgl/i.test(err.message) ? "Je browser kan de kaart niet tekenen (WebGL staat uit)." : "De kaart kon niet laden.");
      }
    })();
    return () => {
      weg = true;
      if (animatie.current !== null) cancelAnimationFrame(animatie.current);
      kaart.current?.remove();
      kaart.current = null;
      bus.current = null;
    };
    // de bestemming verandert niet binnen één afspraak
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // de bus naar de nieuwste positie, soepel
  useEffect(() => {
    const map = kaart.current;
    const mod = ml.current;
    if (!map || !mod || !klaar) return;

    if (!positie) {
      bus.current?.marker.remove();
      bus.current = null;
      vorig.current = null;
      (map.getSource("route") as import("maplibre-gl").GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } });
      map.easeTo({ center: [bestemming.lon, bestemming.lat], zoom: 14, duration: 600 });
      return;
    }

    const eerder = vorig.current;
    if (!bus.current) {
      const { el, draai } = busElement();
      const marker = new mod.Marker({ element: el, anchor: "center" }).setLngLat([positie.lon, positie.lat]).addTo(map);
      bus.current = { marker, draai };
    } else {
      const van = eerder ?? positie;
      const naar = positie;
      const start = performance.now();
      const duur = 1800;
      if (animatie.current !== null) cancelAnimationFrame(animatie.current);
      const stap = (nu: number) => {
        const t = Math.min(1, (nu - start) / duur);
        const e = t * (2 - t);
        bus.current?.marker.setLngLat([van.lon + (naar.lon - van.lon) * e, van.lat + (naar.lat - van.lat) * e]);
        if (t < 1) animatie.current = requestAnimationFrame(stap);
      };
      animatie.current = requestAnimationFrame(stap);
      // alleen draaien als de bus echt een eind verder is (stilstaan geeft ruis)
      if (eerder && (Math.abs(eerder.lat - positie.lat) > 0.00003 || Math.abs(eerder.lon - positie.lon) > 0.00003)) bus.current.draai(richting(eerder, positie));
    }
    vorig.current = { lat: positie.lat, lon: positie.lon };

    (map.getSource("route") as import("maplibre-gl").GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[positie.lon, positie.lat], [bestemming.lon, bestemming.lat]] },
    });
    const grenzen = new mod.LngLatBounds([positie.lon, positie.lat], [positie.lon, positie.lat]).extend([bestemming.lon, bestemming.lat]);
    map.fitBounds(grenzen, { padding: { top: 70, bottom: 70, left: 50, right: 50 }, maxZoom: 16, duration: 900 });
  }, [positie, bestemming.lat, bestemming.lon, klaar]);

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-paper-soft ${className}`}>
      <div ref={houder} className="h-full w-full" />
      {fout && <p role="alert" className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-neutralx-600">{fout}</p>}
    </div>
  );
}
