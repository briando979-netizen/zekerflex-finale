"use client";

import { useState } from "react";
import { WENS_MAX, type BlokTekst } from "@/lib/sites/bloktekst";

// ---------------------------------------------------------------------------
// In de bouwer, onder de tekst van een blok: "Schrijf met AI". De AI doet een voorstel voor de kop en de tekst; er verandert
// niets tot je "Gebruik dit" kiest. Getallen die je niet zelf noemde staan er apart bij om na te lopen.
// ---------------------------------------------------------------------------

interface Voorstel extends BlokTekst {
  controleer: string[];
}

export function BlokTekstHulp({ soort, kop, tekst, bedrijf, plaats, onGebruik }: { soort: string; kop: string; tekst: string; bedrijf: string; plaats: string; onGebruik: (n: BlokTekst) => void }) {
  const [wens, setWens] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [voorstel, setVoorstel] = useState<Voorstel | null>(null);

  async function schrijf() {
    setBezig(true);
    setFout("");
    setVoorstel(null);
    try {
      const r = await fetch("/api/werkgever/sites/slim/bloktekst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ soort, kop, tekst, bedrijf, plaats, wens }) });
      const d = (await r.json().catch(() => null)) as { voorstel?: Voorstel; error?: { message?: string } } | null;
      if (!r.ok || !d?.voorstel) throw new Error(d?.error?.message ?? "De AI kan nu geen tekst schrijven. Probeer het later opnieuw.");
      setVoorstel(d.voorstel);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="rounded-xl border border-hair p-3">
      <p className="text-sm font-semibold text-ink">Schrijf met AI</p>
      <p className="mt-0.5 text-xs text-neutralx-600">De AI doet een voorstel met wat jij al invulde. Er verandert niets tot je het voorstel gebruikt.</p>
      <label className="mt-2 block text-xs font-medium text-neutralx-700">
        Wat moet anders? (mag leeg blijven)
        <input className="field-input mt-1" value={wens} maxLength={WENS_MAX} onChange={(e) => setWens(e.target.value)} placeholder="Bijvoorbeeld: korter, of: gericht op gezinnen" />
      </label>
      <button type="button" onClick={() => void schrijf()} disabled={bezig} className="btn-ghost mt-2 disabled:opacity-50">
        {bezig ? "De AI schrijft… (kan een minuut duren)" : voorstel ? "Schrijf een ander voorstel" : "Schrijf een voorstel"}
      </button>
      {fout ? (
        <p role="alert" className="mt-2 text-sm text-crit">
          {fout}
        </p>
      ) : null}
      {voorstel ? (
        <div role="status" className="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-ink">
          {voorstel.kop ? <p className="font-semibold">{voorstel.kop}</p> : null}
          <p className="mt-1 whitespace-pre-line">{voorstel.tekst}</p>
          {voorstel.controleer.length > 0 ? <p className="mt-2 text-xs text-neutralx-700">Controleer dit voordat je het gebruikt, je noemde het zelf niet: {voorstel.controleer.join(", ")}.</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                // een leeg voorstel voor de kop laat je eigen kop staan
                onGebruik({ kop: voorstel.kop || kop, tekst: voorstel.tekst });
                setVoorstel(null);
              }}
            >
              Gebruik dit
            </button>
            <button type="button" className="btn-ghost" onClick={() => setVoorstel(null)}>
              Niet gebruiken
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
