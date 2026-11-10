"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MonteurBeeld } from "@/lib/installatie/api";

// Het scherm van de monteur: de afspraak, grote knoppen voor de volgende stap en, zolang hij onderweg is,
// de positie van zijn telefoon naar de klant. Geen app nodig: de link werkt in de browser.

const POSITIE_TUSSENTIJD_MS = 5_000;

type Gps = "uit" | "vragen" | "aan" | "geweigerd" | "geen";

export function MonteurScherm({ code, begin }: { code: string; begin: MonteurBeeld }) {
  const [b, setB] = useState<MonteurBeeld>(begin);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gps, setGps] = useState<Gps>("uit");
  const laatsteVerzonden = useRef(0);
  const watch = useRef<number | null>(null);
  const wakker = useRef<{ release: () => Promise<void> } | null>(null);

  const stuurPositie = useCallback(
    async (lat: number, lon: number, nauwkeurigheid: number) => {
      const nu = Date.now();
      if (nu - laatsteVerzonden.current < POSITIE_TUSSENTIJD_MS) return;
      laatsteVerzonden.current = nu;
      try {
        const res = await fetch(`/api/installatie/${encodeURIComponent(code)}/positie`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lon, nauwkeurigheid }),
        });
        const d = (await res.json().catch(() => null)) as { beeld?: MonteurBeeld } | null;
        if (res.ok && d?.beeld) setB(d.beeld);
      } catch {
        /* geen bereik: de volgende meting probeert het opnieuw */
      }
    },
    [code],
  );

  // de positie volgen zolang hij onderweg is, en het scherm aan houden
  useEffect(() => {
    if (b.status !== "onderweg") {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      void wakker.current?.release().catch(() => undefined);
      wakker.current = null;
      setGps("uit");
      return;
    }
    if (!("geolocation" in navigator)) {
      setGps("geen");
      return;
    }
    setGps("vragen");
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setGps("aan");
        void stuurPositie(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
      },
      (e) => setGps(e.code === e.PERMISSION_DENIED ? "geweigerd" : "geen"),
      { enableHighAccuracy: true, maximumAge: 4_000, timeout: 20_000 },
    );
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock?.request("screen").then((l) => (wakker.current = l)).catch(() => undefined);
    return () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      void wakker.current?.release().catch(() => undefined);
      wakker.current = null;
    };
  }, [b.status, stuurPositie]);

  async function zet(naar: string, vraag?: string) {
    if (bezig) return;
    if (vraag && !window.confirm(vraag)) return;
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch(`/api/installatie/${encodeURIComponent(code)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naar }),
      });
      const d = (await res.json().catch(() => null)) as { beeld?: MonteurBeeld; error?: { message?: string } } | null;
      if (!res.ok || !d?.beeld) {
        setFout(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
        return;
      }
      setB(d.beeld);
    } catch {
      setFout("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  const einde = b.status === "klaar" || b.status === "geannuleerd";

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <p className="eyebrow mb-1">ZekerFlex monteur</p>
      <h1 className="font-display text-2xl font-bold leading-tight text-ink">{b.klantNaam}</h1>
      <p className="mt-1 text-sm text-neutralx-600">{b.adres}, {b.plaats}</p>
      <p className="mt-1 text-sm text-neutralx-600">Tijdvak: {b.venster}</p>
      <a href={`geo:${b.bestemming.lat},${b.bestemming.lon}?q=${b.bestemming.lat},${b.bestemming.lon}`} className="mt-2 inline-block text-sm font-semibold text-brand-600 underline underline-offset-4">
        Open in je navigatie-app ›
      </a>

      <section className="mt-5 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 p-5 text-white" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/75">Stand</p>
        <p className="mt-1 text-xl font-semibold">{b.statusLabel}</p>
      </section>

      {b.status === "onderweg" && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${gps === "aan" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          {gps === "aan" && "Je positie wordt gedeeld met de klant, zodat hij je ziet rijden."}
          {gps === "vragen" && "Geef toegang tot je locatie als je telefoon dat vraagt."}
          {gps === "geweigerd" && "Je gaf geen toegang tot je locatie. De klant ziet je dan niet rijden. Zet locatie aan voor deze pagina in je browser."}
          {gps === "geen" && "Je locatie is nu niet te bepalen. We proberen het steeds opnieuw."}
          {gps === "uit" && "Je positie wordt gedeeld zodra je telefoon een plek heeft."}
        </p>
      )}

      {b.notitie && (
        <section className="mt-4 rounded-2xl border border-hair p-4">
          <h2 className="text-sm font-semibold text-ink">Opmerking van kantoor</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-neutralx-700">{b.notitie}</p>
        </section>
      )}

      {b.regels.length > 0 && (
        <section className="mt-4 rounded-2xl border border-hair p-4">
          <h2 className="text-sm font-semibold text-ink">Te installeren</h2>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-neutralx-700">
            {b.regels.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      {fout && <p role="alert" className="mt-4 rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{fout}</p>}

      {!einde && (
        <div className="mt-5 grid gap-3">
          {b.volgende.map((v, i) => (
            <button
              key={v.naar}
              type="button"
              onClick={() => void zet(v.naar, v.vraag)}
              disabled={bezig}
              className={`${i === 0 && v.naar !== "geannuleerd" && v.naar !== "gepland" ? "btn-primary" : "btn-ghost"} w-full py-4 text-base disabled:opacity-60`}
            >
              {bezig ? "Bezig…" : v.label}
            </button>
          ))}
        </div>
      )}
      {einde && <p className="mt-5 text-sm text-neutralx-600">{b.status === "klaar" ? "Klaar. Bedankt! De klant ziet dat de installatie af is." : "Deze afspraak is geannuleerd."}</p>}
    </main>
  );
}
