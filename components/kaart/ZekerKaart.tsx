"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import { GEBOUWEN_3D, KAART_STIJLEN, kaartStijl, NL_GRENZEN, type KaartStijl } from "@/lib/kaart/stijl";
import { afstandTekst, bewaarPunt, duurTekst, gpx, lijnLengte, ritStand, type Punt, type RitPunt, type ZoekResultaat } from "@/lib/kaart/geo";
import { laadKaartMotor } from "@/components/kaart/motor";
import { osmSoortNl, plaatsenGeoJson, veiligeLink, type Plaats } from "@/lib/kaart/plaatsen";
import { schoneTelefoon, schoneWebsite } from "@/lib/kaart/aanmelden";

// ---------------------------------------------------------------------------
// ZekerFlex Kaart: een eigen kaart van Nederland (zelf gehoste OpenStreetMap-
// tegels, lib/kaart/stijl.ts) met 3D-gebouwen, luchtfoto, adres zoeken (PDOK),
// je eigen plek en volgen, een rit opnemen met afstand, tijd en snelheid (GPX
// om mee te nemen) en meten op de kaart. MapLibre wordt pas in de browser
// geladen; de worker krijgt een eigen adres op onze site (CSP: worker-src 'self').
// ---------------------------------------------------------------------------

type Modus = "kijken" | "meten";
type Positie = { lon: number; lat: number; nauwkeurigheid: number };

const RIT_OPSLAG = "zf-kaart-rit";

const NL_TEKSTEN: Record<string, string> = {
  "NavigationControl.ResetBearing": "Noorden boven",
  "NavigationControl.ZoomIn": "Inzoomen",
  "NavigationControl.ZoomOut": "Uitzoomen",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
  "AttributionControl.ToggleAttribution": "Bronnen tonen",
  "AttributionControl.MapFeedback": "Kaartfout melden",
};

/** De inhoud van het kaartje bij een plek. Alleen tekst en één eigen link: nooit HTML van buiten in de pagina. */
function plekInhoud(titel: string, soort: string, regels: string[], links: { href: string; tekst: string; extern?: boolean }[] = []): HTMLElement {
  const el = document.createElement("div");
  el.style.fontFamily = "inherit";
  const kop = document.createElement("p");
  kop.textContent = titel;
  kop.style.cssText = "margin:0;font-weight:700;font-size:14px;color:#111827";
  const sub = document.createElement("p");
  sub.textContent = soort;
  sub.style.cssText = "margin:2px 0 0;font-size:12px;color:#6b7280";
  el.append(kop, sub);
  for (const r of regels.filter(Boolean)) {
    const p = document.createElement("p");
    p.textContent = r;
    p.style.cssText = "margin:4px 0 0;font-size:12px;color:#374151";
    el.append(p);
  }
  for (const link of links) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.tekst;
    if (link.extern) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    a.style.cssText = "display:block;margin-top:8px;font-size:12px;font-weight:700;color:#C2410C;text-decoration:underline";
    el.append(a);
  }
  return el;
}

const lijn = (punten: Punt[]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: punten.length > 1 ? punten : [] } });
const puntenGeo = (punten: Punt[]) => ({
  type: "FeatureCollection" as const,
  features: punten.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: p } })),
});

export function ZekerKaart({ className = "" }: { className?: string }) {
  const houder = useRef<HTMLDivElement>(null);
  const kaart = useRef<MlMap | null>(null);
  const ml = useRef<typeof import("maplibre-gl") | null>(null);
  const watchId = useRef<number | null>(null);
  const plekMarker = useRef<Marker | null>(null);
  const zoekMarker = useRef<Marker | null>(null);
  const wakker = useRef<{ release: () => Promise<void> } | null>(null);
  const gekozen = useRef("");
  /** de bedrijven van ZekerFlex op de kaart (oranje stippen) */
  const plaatsen = useRef<Plaats[]>([]);

  const [klaar, setKlaar] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [stijl, setStijl] = useState<KaartStijl>("licht");
  const [drie, setDrie] = useState(false);
  const [modus, setModus] = useState<Modus>("kijken");
  const [meetPunten, setMeetPunten] = useState<Punt[]>([]);
  const [positie, setPositie] = useState<Positie | null>(null);
  const [volgen, setVolgen] = useState(false);
  const [opnemen, setOpnemen] = useState(false);
  const [rit, setRit] = useState<RitPunt[]>([]);
  const [zoek, setZoek] = useState("");
  const [resultaten, setResultaten] = useState<ZoekResultaat[]>([]);
  const [paneelOpen, setPaneelOpen] = useState(true);

  // de nieuwste waarden voor de kaart- en GPS-gebeurtenissen
  const stand = useRef({ stijl, drie, modus, meetPunten, volgen, opnemen, rit });
  stand.current = { stijl, drie, modus, meetPunten, volgen, opnemen, rit };

  /** Onze eigen lagen (rit, meting) na elke stijlwissel opnieuw erbij. */
  const eigenLagen = useCallback((map: MlMap) => {
    const s = stand.current;
    if (!map.getSource("rit")) {
      map.addSource("rit", { type: "geojson", data: lijn(s.rit.map((p) => [p.lon, p.lat])) });
      map.addLayer({ id: "rit-rand", type: "line", source: "rit", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8 } });
      map.addLayer({ id: "rit", type: "line", source: "rit", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#FF5F1F", "line-width": 5 } });
    }
    if (!map.getSource("meten")) {
      map.addSource("meten", { type: "geojson", data: lijn(s.meetPunten) });
      map.addSource("meetpunten", { type: "geojson", data: puntenGeo(s.meetPunten) });
      map.addLayer({ id: "meten", type: "line", source: "meten", paint: { "line-color": "#1D4E89", "line-width": 3, "line-dasharray": [2, 1.5] } });
      map.addLayer({ id: "meetpunten", type: "circle", source: "meetpunten", paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#1D4E89", "circle-stroke-width": 3 } });
    }
    if (!map.getSource("zf-bedrijven")) {
      map.addSource("zf-bedrijven", { type: "geojson", data: plaatsenGeoJson(plaatsen.current) });
      map.addLayer({ id: "zf-bedrijven-stip", type: "circle", source: "zf-bedrijven", paint: { "circle-radius": 8, "circle-color": "#FF5F1F", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      map.addLayer({
        id: "zf-bedrijven-naam",
        type: "symbol",
        source: "zf-bedrijven",
        minzoom: 13,
        layout: { "text-field": "{naam}", "text-font": ["Noto Sans Medium"], "text-size": 12, "text-offset": [0, 1.2], "text-anchor": "top", "text-optional": true },
        paint: { "text-color": "#1f2937", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      });
    }
    if (map.getLayer(GEBOUWEN_3D)) map.setLayoutProperty(GEBOUWEN_3D, "visibility", s.drie ? "visible" : "none");
  }, []);

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
          style: kaartStijl(window.location.origin, stand.current.stijl, stand.current.drie),
          center: [5.29, 52.13],
          zoom: 7,
          minZoom: 5,
          maxZoom: 19.5,
          maxBounds: NL_GRENZEN,
          hash: "kaart",
          attributionControl: { compact: true },
          locale: NL_TEKSTEN,
        });
        kaart.current = map;
        map.addControl(new mod.NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(new mod.ScaleControl({ unit: "metric" }), "bottom-left");
        map.on("style.load", () => eigenLagen(map));
        map.on("load", () => setKlaar(true));
        map.on("click", (e) => {
          if (stand.current.modus === "meten") {
            setMeetPunten((m) => [...m, [e.lngLat.lng, e.lngLat.lat]]);
            return;
          }
          // eerst een bedrijf van ZekerFlex (oranje stip), anders een plek uit de kaartgegevens
          const eigen = map.getLayer("zf-bedrijven-stip") ? map.queryRenderedFeatures(e.point, { layers: ["zf-bedrijven-stip"] })[0] : undefined;
          if (eigen && typeof eigen.properties?.naam === "string") {
            const p = eigen.properties as { naam: string; soort?: string; adres?: string; plaats?: string; link?: string; website?: string; omschrijving?: string; telefoon?: string };
            const href = veiligeLink(p.link);
            const site = schoneWebsite(p.website);
            const tel = schoneTelefoon(p.telefoon);
            const links = [
              ...(href ? [{ href, tekst: "Bekijk de website, reserveer of bestel ›" }] : []),
              ...(site ? [{ href: site, tekst: "Website van het bedrijf ›", extern: true }] : []),
              ...(tel ? [{ href: `tel:${tel.replace(/[^\d+]/g, "")}`, tekst: `Bel ${tel}` }] : []),
            ];
            new mod.Popup({ closeButton: true, maxWidth: "260px", offset: 12 })
              .setLngLat(e.lngLat)
              .setDOMContent(plekInhoud(p.naam, `${p.soort ?? "Bedrijf"} · ZekerFlex`, [[p.adres, p.plaats].filter(Boolean).join(", "), p.omschrijving ?? ""], links))
              .addTo(map);
            return;
          }
          const poiLagen = (map.getStyle().layers ?? [])
            .filter((l) => (l as { "source-layer"?: string })["source-layer"] === "pois")
            .map((l) => l.id);
          const poi = poiLagen.length ? map.queryRenderedFeatures(e.point, { layers: poiLagen })[0] : undefined;
          const naam = poi?.properties?.name;
          if (poi && typeof naam === "string" && naam) {
            new mod.Popup({ closeButton: true, maxWidth: "260px", offset: 12 })
              .setLngLat(e.lngLat)
              .setDOMContent(plekInhoud(naam, osmSoortNl(poi.properties?.kind), []))
              .addTo(map);
          }
        });
        map.on("dragstart", () => setVolgen(false));
      } catch (err) {
        setFout(err instanceof Error && /webgl/i.test(err.message) ? "Je browser kan de kaart niet tekenen (WebGL staat uit)." : "De kaart kon niet laden. Probeer het later opnieuw.");
      }
    })();
    return () => {
      weg = true;
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      void wakker.current?.release().catch(() => undefined);
      kaart.current?.remove();
      kaart.current = null;
    };
  }, [eigenLagen]);

  // de bedrijven van ZekerFlex (oranje stippen), zodra de kaart er is
  useEffect(() => {
    if (!klaar) return;
    const ctl = new AbortController();
    void fetch("/api/kaart/plaatsen", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plaatsen?: Plaats[] } | null) => {
        if (!d || !Array.isArray(d.plaatsen)) return;
        plaatsen.current = d.plaatsen;
        (kaart.current?.getSource("zf-bedrijven") as GeoJSONSource | undefined)?.setData(plaatsenGeoJson(d.plaatsen));
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [klaar]);

  // op een smal scherm begint het gereedschap ingeklapt, zodat de kaart te zien is
  useEffect(() => {
    if (window.innerWidth < 640) setPaneelOpen(false);
  }, []);

  // een eerder opgenomen rit terug (alleen in deze browser)
  useEffect(() => {
    try {
      const bewaard = JSON.parse(localStorage.getItem(RIT_OPSLAG) ?? "null") as RitPunt[] | null;
      if (Array.isArray(bewaard) && bewaard.length > 1) setRit(bewaard);
    } catch {
      // geen opslag: niets terug te zetten
    }
  }, []);

  // stijl, 3D, meting en rit naar de kaart
  useEffect(() => {
    const map = kaart.current;
    if (map && klaar) map.setStyle(kaartStijl(window.location.origin, stijl, stand.current.drie), { diff: false });
  }, [stijl, klaar]);

  useEffect(() => {
    const map = kaart.current;
    if (!map || !klaar) return;
    if (map.getLayer(GEBOUWEN_3D)) map.setLayoutProperty(GEBOUWEN_3D, "visibility", drie ? "visible" : "none");
    map.easeTo(drie ? { pitch: 60, bearing: map.getBearing() || -17, zoom: Math.max(map.getZoom(), 15.5), duration: 900 } : { pitch: 0, bearing: 0, duration: 700 });
  }, [drie, klaar]);

  useEffect(() => {
    const map = kaart.current;
    (map?.getSource("meten") as GeoJSONSource | undefined)?.setData(lijn(meetPunten));
    (map?.getSource("meetpunten") as GeoJSONSource | undefined)?.setData(puntenGeo(meetPunten));
  }, [meetPunten]);

  useEffect(() => {
    (kaart.current?.getSource("rit") as GeoJSONSource | undefined)?.setData(lijn(rit.map((p) => [p.lon, p.lat])));
  }, [rit]);

  // ---- GPS ----------------------------------------------------------------

  const opPositie = useCallback((pos: GeolocationPosition) => {
    const p: Positie = { lon: pos.coords.longitude, lat: pos.coords.latitude, nauwkeurigheid: pos.coords.accuracy };
    setPositie(p);
    setMelding(null);
    const map = kaart.current;
    const mod = ml.current;
    if (map && mod) {
      if (!plekMarker.current) {
        const el = document.createElement("div");
        el.className = "h-5 w-5 rounded-full bg-sky-600 ring-4 ring-white shadow-lg";
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", "Jouw plek");
        plekMarker.current = new mod.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
      } else plekMarker.current.setLngLat([p.lon, p.lat]);
      if (stand.current.volgen) map.easeTo({ center: [p.lon, p.lat], duration: 600 });
    }
    if (stand.current.opnemen) {
      const punt: RitPunt = { lon: p.lon, lat: p.lat, t: pos.timestamp, nauwkeurigheid: p.nauwkeurigheid };
      if (bewaarPunt(stand.current.rit, punt)) setRit((r) => [...r, punt]);
    }
  }, []);

  const startGps = useCallback((): boolean => {
    if (!("geolocation" in navigator)) {
      setMelding("Je browser geeft geen locatie door.");
      return false;
    }
    if (watchId.current !== null) return true;
    watchId.current = navigator.geolocation.watchPosition(
      opPositie,
      (err) =>
        setMelding(
          err.code === err.PERMISSION_DENIED
            ? "Je hebt geen toestemming gegeven voor je locatie. Zet die aan in de instellingen van je browser."
            : "Je locatie is nu niet te bepalen. Sta je binnen? Probeer het buiten nog eens.",
        ),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
    );
    return true;
  }, [opPositie]);

  function waarBenIk() {
    if (!startGps()) return;
    setVolgen(true);
    if (positie) kaart.current?.flyTo({ center: [positie.lon, positie.lat], zoom: 16 });
    else {
      setMelding("Je plek wordt gezocht…");
      navigator.geolocation.getCurrentPosition(
        (pos) => kaart.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 }),
        () => undefined,
        { enableHighAccuracy: true, timeout: 20_000 },
      );
    }
  }

  async function ritKnop() {
    if (opnemen) {
      setOpnemen(false);
      void wakker.current?.release().catch(() => undefined);
      wakker.current = null;
      try {
        localStorage.setItem(RIT_OPSLAG, JSON.stringify(stand.current.rit));
      } catch {
        // geen opslag: de rit blijft tot je de pagina sluit
      }
      return;
    }
    if (!startGps()) return;
    setRit([]);
    setOpnemen(true);
    setVolgen(true);
    // scherm aan houden tijdens de rit (als de browser dat kan)
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl) wakker.current = await wl.request("screen");
    } catch {
      // geen wake lock: dan gaat het scherm gewoon uit
    }
  }

  function downloadGpx() {
    const naam = `Rit ${new Date(rit[0]?.t ?? Date.now()).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}`;
    const blob = new Blob([gpx(rit, naam)], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zekerflex-rit-${new Date(rit[0]?.t ?? Date.now()).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.gpx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---- zoeken -------------------------------------------------------------

  useEffect(() => {
    const q = zoek.trim();
    // na een keuze staat de gekozen naam in het veld: dan niet opnieuw zoeken
    if (q.length < 2 || q === gekozen.current) {
      setResultaten([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/kaart/zoek?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: { resultaten?: ZoekResultaat[] }) => setResultaten(d.resultaten ?? []))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [zoek]);

  function kies(r: ZoekResultaat) {
    const map = kaart.current;
    const mod = ml.current;
    gekozen.current = r.naam;
    setResultaten([]);
    setZoek(r.naam);
    if (!map || !mod) return;
    setVolgen(false);
    map.flyTo({ center: [r.lon, r.lat], zoom: r.soort === "Adres" ? 17.5 : r.soort === "Straat" ? 16 : 13 });
    zoekMarker.current?.remove();
    zoekMarker.current = new mod.Marker({ color: "#FF5F1F" }).setLngLat([r.lon, r.lat]).addTo(map);
  }

  const stats = ritStand(rit);
  const meetLengte = lijnLengte(meetPunten);
  const knop = "rounded-full px-3 py-2 text-sm font-semibold ring-1 ring-black/10 transition-colors";
  const aan = "bg-ink text-white ring-ink";
  const uit = "bg-white text-ink hover:bg-paper-soft";

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* h-full/w-full, geen absolute: de CSS van MapLibre zet .maplibregl-map op position: relative */}
      <div ref={houder} className="h-full w-full" role="region" aria-label="Kaart van Nederland" />

      {fout && (
        <div role="alert" className="absolute inset-0 grid place-items-center bg-paper-soft p-6 text-center text-sm text-ink">
          {fout}
        </div>
      )}

      {/* gereedschap */}
      <div className="absolute left-3 top-3 z-10 w-[min(22rem,calc(100%-4.5rem))] space-y-2">
        <div className="rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur">
          <div className="relative">
            <label htmlFor="kaart-zoek" className="sr-only">
              Zoek een adres, straat of plaats
            </label>
            <input
              id="kaart-zoek"
              type="search"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setResultaten([]);
              }}
              placeholder="Zoek een adres, straat of plaats"
              autoComplete="off"
              className="field-input w-full"
            />
            {resultaten.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/10">
                {resultaten.map((r) => (
                  <li key={`${r.naam}-${r.lon}`}>
                    <button type="button" onClick={() => kies(r)} className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-paper-soft">
                      <span className="min-w-0 truncate">{r.naam}</span>
                      <span className="flex-shrink-0 text-xs text-neutralx-500">{r.soort}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button type="button" className="text-xs font-semibold text-neutralx-600 underline-offset-2 hover:underline sm:hidden" aria-expanded={paneelOpen} onClick={() => setPaneelOpen(!paneelOpen)}>
              {paneelOpen ? "Gereedschap verbergen" : "Gereedschap tonen"}
            </button>
          </div>
          <div className={`${paneelOpen ? "block" : "hidden"} space-y-2 sm:block`}>
            <div role="group" aria-label="Kaartstijl" className="flex flex-wrap gap-1.5">
              {KAART_STIJLEN.map((s) => (
                <button key={s.id} type="button" aria-pressed={stijl === s.id} onClick={() => setStijl(s.id)} className={`${knop} ${stijl === s.id ? aan : uit}`}>
                  {s.label}
                </button>
              ))}
              <button type="button" aria-pressed={drie} onClick={() => setDrie(!drie)} className={`${knop} ${drie ? aan : uit}`}>
                3D
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={waarBenIk} className={`${knop} ${uit}`}>
                Waar ben ik?
              </button>
              <button type="button" aria-pressed={volgen} onClick={() => (volgen ? setVolgen(false) : (startGps() && setVolgen(true)))} className={`${knop} ${volgen ? aan : uit}`}>
                Volg mij
              </button>
              <button
                type="button"
                aria-pressed={modus === "meten"}
                onClick={() => {
                  setModus(modus === "meten" ? "kijken" : "meten");
                  if (modus !== "meten") setMeetPunten([]);
                }}
                className={`${knop} ${modus === "meten" ? aan : uit}`}
              >
                Meten
              </button>
              <button type="button" aria-pressed={opnemen} onClick={() => void ritKnop()} className={`${knop} ${opnemen ? "bg-red-600 text-white ring-red-600" : uit}`}>
                {opnemen ? "Stop rit" : "Rit opnemen"}
              </button>
            </div>
          </div>
          {melding && (
            <p role="status" className="mt-2 text-xs text-neutralx-600">
              {melding}
            </p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-neutralx-500">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF5F1F] ring-2 ring-white" />
            Oranje stip: een bedrijf van ZekerFlex. Tik op een plek voor meer.
          </p>
          <Link href="/werkgever/kaart" className="mt-1 inline-block text-[0.7rem] font-semibold text-neutralx-600 underline underline-offset-2">
            Zet je eigen bedrijf op de kaart
          </Link>
        </div>

        {modus === "meten" && (
          <div className="rounded-2xl bg-white/95 p-3 text-sm shadow-xl ring-1 ring-black/5">
            <p className="font-semibold">{meetPunten.length < 2 ? "Tik op de kaart om punten te zetten" : `Afstand: ${afstandTekst(meetLengte)}`}</p>
            {meetPunten.length > 0 && (
              <button type="button" className="mt-1 text-xs font-semibold underline underline-offset-2" onClick={() => setMeetPunten([])}>
                Meting wissen
              </button>
            )}
          </div>
        )}
      </div>

      {/* de rit */}
      {(opnemen || rit.length > 1) && (
        <div className="absolute inset-x-3 bottom-8 z-10 mx-auto max-w-md rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-neutralx-500">{opnemen ? "Rit wordt opgenomen" : "Laatste rit"}</p>
            {!opnemen && rit.length > 1 && (
              <div className="flex gap-2">
                <button type="button" className="text-xs font-semibold underline underline-offset-2" onClick={downloadGpx}>
                  Download GPX
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold underline underline-offset-2"
                  onClick={() => {
                    setRit([]);
                    try {
                      localStorage.removeItem(RIT_OPSLAG);
                    } catch {
                      // niets bewaard
                    }
                  }}
                >
                  Wissen
                </button>
              </div>
            )}
          </div>
          <dl className="mt-1 grid grid-cols-4 gap-2 text-center">
            {[
              ["Afstand", afstandTekst(stats.meters)],
              ["Tijd", duurTekst(stats.seconden)],
              ["Gemiddeld", `${Math.round(stats.gemiddeld)} km/u`],
              ["Nu", opnemen ? `${Math.round(stats.nu)} km/u` : "–"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[0.7rem] text-neutralx-500">{k}</dt>
                <dd className="num font-display text-base font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          {positie && opnemen && <p className="mt-1 text-center text-[0.7rem] text-neutralx-500">GPS tot op {Math.round(positie.nauwkeurigheid)} m nauwkeurig</p>}
        </div>
      )}
    </div>
  );
}
