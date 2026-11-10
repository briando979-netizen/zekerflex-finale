"use client";

import { useEffect, useRef, useState } from "react";
import { VolgKaart } from "@/components/kaart/VolgKaart";
import type { KlantBeeld } from "@/lib/installatie/model";

// De pagina die de klant ziet: wanneer de monteur komt, waar zijn ZekerFlex-bus rijdt en hoe laat hij er
// ongeveer is. De stand wordt elke 10 seconden opgehaald, behalve als het tabblad niet zichtbaar is.

const VERNIEUW_MS = 10_000;

export function InstallatieVolg({ code, begin }: { code: string; begin: KlantBeeld }) {
  const [b, setB] = useState<KlantBeeld>(begin);
  const [fout, setFout] = useState(false);
  const mislukt = useRef(0);

  useEffect(() => {
    let weg = false;
    async function haal() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/installatie/${encodeURIComponent(code)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as { beeld?: KlantBeeld };
        if (weg || !d.beeld) return;
        mislukt.current = 0;
        setFout(false);
        setB(d.beeld);
      } catch {
        mislukt.current += 1;
        if (!weg && mislukt.current >= 2) setFout(true);
      }
    }
    const t = setInterval(() => void haal(), VERNIEUW_MS);
    const zichtbaar = () => {
      if (!document.hidden) void haal();
    };
    document.addEventListener("visibilitychange", zichtbaar);
    return () => {
      weg = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", zichtbaar);
    };
  }, [code]);

  const klaar = b.status === "klaar";
  const geannuleerd = b.status === "geannuleerd";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <p className="eyebrow mb-1">ZekerFlex installatie</p>
      <h1 className="font-display text-2xl font-bold leading-tight text-ink">{b.klantNaam}</h1>
      <p className="mt-1 text-sm text-neutralx-600">{b.adres}, {b.plaats}</p>

      <section
        aria-live="polite"
        className={`mt-5 rounded-2xl p-5 text-white ${geannuleerd ? "bg-neutralx-600" : klaar ? "bg-ok" : "bg-gradient-to-br from-brand-700 to-brand-500"}`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{b.statusLabel}</p>
        <p className="mt-1 text-lg font-semibold leading-snug">{b.tekst}</p>
        {b.status === "onderweg" && b.etaTijd && (
          <p className="mt-3 text-sm text-white/90">
            Verwacht om <strong className="text-base">{b.etaTijd}</strong> <span className="text-white/75">(een schatting)</span>
          </p>
        )}
        {b.status === "gepland" && <p className="mt-2 text-sm text-white/85">Tijdvak: {b.venster}</p>}
      </section>

      {!geannuleerd && (
        <div className="mt-4">
          <VolgKaart bestemming={b.bestemming} positie={b.status === "onderweg" ? b.positie : null} className="h-72 sm:h-96" />
          {b.status === "onderweg" && b.positieOud && (
            <p role="status" className="mt-2 text-xs text-neutralx-500">We wachten op de nieuwe positie van de bus. Misschien heeft de monteur even geen bereik.</p>
          )}
          {fout && <p role="alert" className="mt-2 text-xs text-warn">De verbinding is even weg. We proberen het zo opnieuw.</p>}
        </div>
      )}

      <ol className="mt-6 space-y-3" aria-label="Voortgang">
        {b.stappen.map((s) => (
          <li key={s.key} className="flex items-center gap-3" aria-current={s.actief ? "step" : undefined}>
            <span
              aria-hidden
              className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${
                s.gedaan ? "bg-ok text-white" : s.actief ? "bg-brand-500 text-white ring-4 ring-brand-100" : "bg-hair text-neutralx-500"
              }`}
            >
              {s.gedaan ? "✓" : ""}
            </span>
            <span className={`flex-1 text-sm ${s.actief ? "font-semibold text-ink" : s.gedaan ? "text-neutralx-700" : "text-neutralx-500"}`}>{s.label}</span>
            {s.tijd && <span className="text-xs text-neutralx-500">{s.tijd}</span>}
          </li>
        ))}
      </ol>

      {b.regels.length > 0 && (
        <section className="mt-6 rounded-2xl border border-hair p-4">
          <h2 className="text-sm font-semibold text-ink">Wat we komen installeren</h2>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-neutralx-700">
            {b.regels.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs text-neutralx-500">
        Je ziet de monteur alleen zolang hij naar je toe rijdt. Daarna verdwijnt zijn positie. Vragen? Antwoord op de mail waarmee je deze link kreeg.
      </p>
    </main>
  );
}
