"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { afstandTekst } from "@/lib/kaart/geo";

// Lesroute opnemen in de instructeur-app (lib/rijschool/lesroute.ts): alleen
// tijdens een gestarte les, met de telefoon van de instructeur. Elke 30 seconden
// gaan de nieuwe punten naar de server (die dunt uit en rondt af); bij stoppen of
// sluiten de rest. Het scherm blijft aan zolang er wordt opgenomen.

type Punt = [number, number, number];

export function RouteOpnemen({ api, datum, lesId, meters: beginMeters }: { api: string; datum: string; lesId: string; meters: number }) {
  const [aan, setAan] = useState(false);
  const [meters, setMeters] = useState(beginMeters);
  const [melding, setMelding] = useState<string | null>(null);
  const buffer = useRef<Punt[]>([]);
  const watch = useRef<number | null>(null);
  const wakker = useRef<{ release: () => Promise<void> } | null>(null);

  const stuur = useCallback(
    async (laatste = false) => {
      const punten = buffer.current.splice(0, 600);
      if (punten.length === 0) return;
      try {
        const res = await fetch(`${api}?datum=${datum}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actie: "route", lesId, punten }),
          keepalive: laatste,
        });
        const d = (await res.json().catch(() => ({}))) as { meters?: number; error?: { message?: string } };
        if (!res.ok) throw new Error(d.error?.message ?? "Opslaan lukte niet.");
        if (typeof d.meters === "number") setMeters(d.meters);
      } catch (e) {
        // niet kwijtraken: terug in de buffer voor de volgende poging
        buffer.current.unshift(...punten);
        setMelding(e instanceof Error ? e.message : "Opslaan lukte niet; ik probeer het straks opnieuw.");
      }
    },
    [api, datum, lesId],
  );

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    void wakker.current?.release().catch(() => undefined);
    wakker.current = null;
    setAan(false);
    void stuur(true);
  }, [stuur]);

  async function start() {
    if (!("geolocation" in navigator)) return setMelding("Deze telefoon geeft geen locatie door.");
    setMelding(null);
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > 50) return;
        buffer.current.push([pos.coords.longitude, pos.coords.latitude, Math.round(pos.timestamp / 1000)]);
      },
      (err) => setMelding(err.code === err.PERMISSION_DENIED ? "Geef de app toestemming voor je locatie (instellingen van je browser)." : "Je locatie is even niet te bepalen."),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 30_000 },
    );
    setAan(true);
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl) wakker.current = await wl.request("screen");
    } catch {
      // geen wake lock: dan kan het scherm uitgaan
    }
  }

  // elke 30 seconden opslaan; bij weggaan (les afgerond, scherm dicht) de rest
  useEffect(() => {
    if (!aan) return;
    const t = setInterval(() => void stuur(), 30_000);
    return () => clearInterval(t);
  }, [aan, stuur]);
  useEffect(() => () => {
    if (watch.current !== null) {
      navigator.geolocation.clearWatch(watch.current);
      void stuur(true);
    }
  }, [stuur]);

  return (
    <div className="rounded-2xl border border-hair bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Lesroute</p>
          <p className="text-xs text-neutralx-500">
            {aan ? "Wordt opgenomen. De leerling ziet de route na de les." : meters > 0 ? `${afstandTekst(meters)} opgeslagen.` : "Neem de gereden route op; de leerling ziet hem na de les."}
          </p>
        </div>
        <button type="button" aria-pressed={aan} onClick={aan ? stop : () => void start()} className={`rounded-full px-4 py-2 text-sm font-semibold ${aan ? "bg-red-600 text-white" : "bg-ink text-white"}`}>
          {aan ? "Stop route" : "Route opnemen"}
        </button>
      </div>
      {melding && (
        <p role="status" className="mt-2 text-xs text-neutralx-600">
          {melding}
        </p>
      )}
    </div>
  );
}
