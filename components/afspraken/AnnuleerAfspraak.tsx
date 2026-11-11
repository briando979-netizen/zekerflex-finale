"use client";

import { useState } from "react";

// De knop op de persoonlijke afsprakenpagina van een klant: annuleren in twee stappen (eerst "Annuleren", dan een
// bevestiging in de pagina zelf, geen venstertje). De server controleert alles opnieuw; dit scherm is alleen de ingang.

type Stand = "rust" | "zeker" | "bezig" | "klaar";

export function AnnuleerAfspraak({ slug, token, bedrijfsnaam, kanAnnuleren, uitleg, nieuweAfspraakMogelijk }: { slug: string; token: string; bedrijfsnaam: string; kanAnnuleren: boolean; uitleg: string; nieuweAfspraakMogelijk: boolean }) {
  const [stand, setStand] = useState<Stand>("rust");
  const [fout, setFout] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const kaart = "mt-4 rounded-2xl border border-hair bg-white p-5 shadow-sm";

  async function annuleer() {
    if (stand === "bezig") return;
    setStand("bezig");
    setFout(null);
    try {
      const res = await fetch(`/api/boeken/${slug}/afspraak`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, website }), referrerPolicy: "no-referrer" });
      const d = (await res.json().catch(() => null)) as { geannuleerd?: boolean; error?: { message?: string } } | null;
      if (res.ok && d?.geannuleerd) {
        setStand("klaar");
        return;
      }
      setFout(d?.error?.message ?? "Annuleren lukte niet. Probeer het opnieuw of bel het bedrijf.");
      setStand("rust");
    } catch {
      setFout("Annuleren lukte niet. Controleer je verbinding en probeer het opnieuw.");
      setStand("rust");
    }
  }

  const nieuw = nieuweAfspraakMogelijk ? (
    <a href={`/boeken/${slug}`} className="btn-primary mt-4 inline-block px-5 py-2.5">
      Een nieuwe afspraak maken
    </a>
  ) : null;

  if (stand === "klaar") {
    return (
      <div className={kaart} role="status">
        <h2 className="font-display text-lg font-bold text-ink">Je afspraak is geannuleerd</h2>
        <p className="mt-2 text-sm text-neutralx-600">{bedrijfsnaam} weet het. De tijd is weer vrij. Wil je op een ander moment komen? Maak dan een nieuwe afspraak.</p>
        {nieuw}
      </div>
    );
  }

  if (!kanAnnuleren) {
    return (
      <div className={kaart}>
        <p className="text-sm text-neutralx-600">{uitleg}</p>
        {nieuw}
      </div>
    );
  }

  return (
    <div className={kaart}>
      {fout && (
        <p role="alert" className="mb-3 rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      {/* een mens ziet dit veld niet; een bot vult het in en wordt dan genegeerd */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {stand === "rust" ? (
        <>
          <p className="text-sm text-neutralx-600">Kun je niet komen? Annuleer je afspraak, dan komt de tijd vrij voor een ander. Wil je een andere tijd? Annuleer en maak daarna een nieuwe afspraak.</p>
          <button type="button" className="btn-primary mt-4 px-5 py-2.5" onClick={() => setStand("zeker")}>
            Annuleren
          </button>
        </>
      ) : (
        <div role="group" aria-label="Annuleren bevestigen">
          <p className="text-sm font-semibold text-ink">Weet je zeker dat je deze afspraak wilt annuleren?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={stand === "bezig"} className="btn-primary px-5 py-2.5 disabled:opacity-60" onClick={() => void annuleer()}>
              {stand === "bezig" ? "Bezig…" : "Ja, annuleer mijn afspraak"}
            </button>
            <button type="button" disabled={stand === "bezig"} className="btn-ghost px-5 py-2.5 disabled:opacity-60" onClick={() => setStand("rust")}>
              Nee, laat staan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
