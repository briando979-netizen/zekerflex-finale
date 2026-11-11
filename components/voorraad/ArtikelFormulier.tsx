"use client";

import { useState } from "react";
import { EENHEDEN, heeftDecimalen, type Artikel } from "@/lib/voorraad/model";
import { leesFout } from "@/components/voorraad/fout";

// Een artikel toevoegen of bewerken. Bij bewerken staat het aantal er niet bij: dat verandert alleen via een mutatie of telling.

const euroVeld = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
/** "1,25" → 125 centen; leeg → null; onzin → NaN. */
const centUitVeld = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Number.NaN;
};

export function ArtikelFormulier({ begin, opgeslagen, annuleer }: { begin?: Artikel; opgeslagen: (a: Artikel) => void; annuleer: () => void }) {
  const [naam, setNaam] = useState(begin?.naam ?? "");
  const [sku, setSku] = useState(begin?.sku ?? "");
  const [eenheid, setEenheid] = useState<string>(begin?.eenheid ?? "stuk");
  const [aantal, setAantal] = useState("0");
  const [minimum, setMinimum] = useState(begin ? String(begin.minimum).replace(".", ",") : "0");
  const [kostprijs, setKostprijs] = useState(euroVeld(begin?.kostprijsCent ?? null));
  const [leverancier, setLeverancier] = useState(begin?.leverancier ?? "");
  const [locatie, setLocatie] = useState(begin?.locatie ?? "");
  const [notitie, setNotitie] = useState(begin?.notitie ?? "");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const pre = begin ? `vr-${begin.id}` : "vr-nieuw";
  const decimaal = (EENHEDEN as readonly string[]).includes(eenheid) && heeftDecimalen(eenheid as (typeof EENHEDEN)[number]);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    const kostprijsCent = centUitVeld(kostprijs);
    if (Number.isNaN(kostprijsCent)) {
      setFout("De kostprijs is geen bedrag. Vul bijvoorbeeld 1,25 in.");
      return;
    }
    setBezig(true);
    try {
      const gedeeld = { naam, sku, eenheid, minimum, kostprijsCent, leverancier, locatie, notitie };
      const res = await fetch("/api/werkgever/voorraad", {
        method: begin ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(begin ? { ...gedeeld, id: begin.id, actie: "bewerken" } : { ...gedeeld, aantal }),
      });
      if (!res.ok) {
        setFout(await leesFout(res, "Het artikel kon niet worden bewaard."));
        return;
      }
      opgeslagen(((await res.json()) as { artikel: Artikel }).artikel);
    } catch {
      setFout("Het artikel kon niet worden bewaard. Controleer je verbinding.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${pre}-naam`} className="field-label">
          Naam
        </label>
        <input id={`${pre}-naam`} className="field-input" value={naam} maxLength={80} required onChange={(e) => setNaam(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${pre}-sku`} className="field-label">
          Artikelnummer (niet verplicht)
        </label>
        <input id={`${pre}-sku`} className="field-input" value={sku} maxLength={40} onChange={(e) => setSku(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${pre}-eenheid`} className="field-label">
          Eenheid
        </label>
        <select id={`${pre}-eenheid`} className="field-input" value={eenheid} onChange={(e) => setEenheid(e.target.value)}>
          {EENHEDEN.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      {!begin && (
        <div>
          <label htmlFor={`${pre}-aantal`} className="field-label">
            Aantal nu
          </label>
          <input id={`${pre}-aantal`} className="field-input" inputMode="decimal" value={aantal} onChange={(e) => setAantal(e.target.value)} />
        </div>
      )}
      <div>
        <label htmlFor={`${pre}-minimum`} className="field-label">
          Minimum (waarschuwing, 0 = geen)
        </label>
        <input id={`${pre}-minimum`} className="field-input" inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
      </div>
      <p className="text-xs text-neutralx-500 sm:col-span-2">{decimaal ? "Bij liter, kilo en meter mag je tot drie cijfers achter de komma gebruiken." : "Bij deze eenheid kan alleen een heel aantal."}</p>
      <div>
        <label htmlFor={`${pre}-kost`} className="field-label">
          Kostprijs per eenheid in euro (niet verplicht)
        </label>
        <input id={`${pre}-kost`} className="field-input" inputMode="decimal" value={kostprijs} onChange={(e) => setKostprijs(e.target.value)} placeholder="bijvoorbeeld 1,25" />
      </div>
      <div>
        <label htmlFor={`${pre}-lev`} className="field-label">
          Leverancier (niet verplicht)
        </label>
        <input id={`${pre}-lev`} className="field-input" value={leverancier} maxLength={80} onChange={(e) => setLeverancier(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${pre}-loc`} className="field-label">
          Locatie of plank (niet verplicht)
        </label>
        <input id={`${pre}-loc`} className="field-input" value={locatie} maxLength={60} onChange={(e) => setLocatie(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${pre}-notitie`} className="field-label">
          Notitie (hoogstens 300 tekens)
        </label>
        <textarea id={`${pre}-notitie`} className="field-input" rows={2} maxLength={300} value={notitie} onChange={(e) => setNotitie(e.target.value)} />
      </div>
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit sm:col-span-2">
          {fout}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={bezig}>
          {bezig ? "Bewaren…" : "Bewaren"}
        </button>
        <button type="button" className="rounded-lg border border-hairstrong px-3 py-2 text-sm font-semibold text-ink" onClick={annuleer}>
          Annuleren
        </button>
      </div>
    </form>
  );
}
