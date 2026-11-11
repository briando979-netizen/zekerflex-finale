"use client";

import { useState } from "react";
import type { Kamer } from "@/lib/kamers/model";
import { centUitVeld, euroVeld, leesFout } from "@/components/kamers/hulp";

// Een kamer toevoegen of bewerken. De schoonmaakstatus staat hier niet bij: die zet je met de knoppen in de lijst.

export function KamerFormulier({ begin, opgeslagen, annuleer }: { begin?: Kamer; opgeslagen: (k: Kamer) => void; annuleer: () => void }) {
  const [naam, setNaam] = useState(begin?.naam ?? "");
  const [type, setType] = useState(begin?.type ?? "");
  const [capaciteit, setCapaciteit] = useState(String(begin?.capaciteit ?? 2));
  const [prijs, setPrijs] = useState(euroVeld(begin?.prijsCent ?? null));
  const [notitie, setNotitie] = useState(begin?.notitie ?? "");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const pre = begin ? `kr-${begin.id}` : "kr-nieuw";

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    const prijsCent = centUitVeld(prijs);
    if (Number.isNaN(prijsCent)) {
      setFout("De prijs is geen bedrag. Vul bijvoorbeeld 95,00 in, of laat het leeg.");
      return;
    }
    setBezig(true);
    try {
      const gedeeld = { naam, type, capaciteit: Number(capaciteit), prijsCent, notitie };
      const res = await fetch("/api/werkgever/kamers", {
        method: begin ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(begin ? { ...gedeeld, id: begin.id, actie: "bewerken" } : gedeeld),
      });
      if (!res.ok) {
        setFout(await leesFout(res, "De kamer kon niet worden bewaard."));
        return;
      }
      opgeslagen(((await res.json()) as { kamer: Kamer }).kamer);
    } catch {
      setFout("De kamer kon niet worden bewaard. Controleer je verbinding.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className="grid gap-3 rounded-xl border border-hairstrong bg-white p-4 sm:grid-cols-2">
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit sm:col-span-2">
          {fout}
        </p>
      )}
      <div>
        <label htmlFor={`${pre}-naam`} className="field-label">
          Naam of nummer
        </label>
        <input id={`${pre}-naam`} className="field-input" value={naam} maxLength={40} required onChange={(e) => setNaam(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${pre}-type`} className="field-label">
          Type (niet verplicht)
        </label>
        <input id={`${pre}-type`} className="field-input" value={type} maxLength={60} onChange={(e) => setType(e.target.value)} placeholder="bijvoorbeeld Tweepersoonskamer" />
      </div>
      <div>
        <label htmlFor={`${pre}-cap`} className="field-label">
          Capaciteit (personen)
        </label>
        <input id={`${pre}-cap`} type="number" min={1} max={20} className="field-input" value={capaciteit} required onChange={(e) => setCapaciteit(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${pre}-prijs`} className="field-label">
          Prijs per nacht in euro, inclusief btw (niet verplicht)
        </label>
        <input id={`${pre}-prijs`} className="field-input" inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} placeholder="bijvoorbeeld 95,00" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${pre}-notitie`} className="field-label">
          Notitie (niet verplicht, hoogstens 300 tekens)
        </label>
        <textarea id={`${pre}-notitie`} className="field-input" rows={2} value={notitie} maxLength={300} onChange={(e) => setNotitie(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={bezig}>
          {begin ? "Wijzigingen bewaren" : "Kamer toevoegen"}
        </button>
        <button type="button" className="rounded-lg border border-hairstrong px-3 py-2 text-sm font-semibold text-ink hover:border-brand-500" onClick={annuleer}>
          Annuleren
        </button>
      </div>
    </form>
  );
}
