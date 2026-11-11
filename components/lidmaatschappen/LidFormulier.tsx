"use client";

import { useState } from "react";
import type { Lid } from "@/lib/lidmaatschappen/model";
import { leesFout } from "@/components/voorraad/fout";

// Een lid toevoegen of bewerken. Er is bewust geen veld voor een geboortedatum: die is hier niet nodig en bewaren we dus niet.

export function LidFormulier({ begin, opgeslagen, annuleer }: { begin?: Lid; opgeslagen: (l: Lid) => void; annuleer: () => void }) {
  const [naam, setNaam] = useState(begin?.naam ?? "");
  const [telefoon, setTelefoon] = useState(begin?.telefoon ?? "");
  const [email, setEmail] = useState(begin?.email ?? "");
  const [notitie, setNotitie] = useState(begin?.notitie ?? "");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const pre = begin ? `lid-${begin.id}` : "lid-nieuw";

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setBezig(true);
    try {
      const res = await fetch("/api/werkgever/lidmaatschappen", {
        method: begin ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "lid", ...(begin ? { id: begin.id, actie: "bewerken" } : {}), naam, telefoon, email, notitie }),
      });
      if (!res.ok) {
        setFout(await leesFout(res, "Het lid kon niet worden bewaard."));
        return;
      }
      opgeslagen(((await res.json()) as { lid: Lid }).lid);
    } catch {
      setFout("Het lid kon niet worden bewaard. Controleer je verbinding.");
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
        <label htmlFor={`${pre}-tel`} className="field-label">
          Telefoon
        </label>
        <input id={`${pre}-tel`} className="field-input" type="tel" value={telefoon} maxLength={30} onChange={(e) => setTelefoon(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${pre}-mail`} className="field-label">
          E-mail
        </label>
        <input id={`${pre}-mail`} className="field-input" type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <p className="text-xs text-neutralx-500 sm:col-span-2">Vul minstens een telefoonnummer of een e-mailadres in. Een geboortedatum bewaren we niet: die heb je hier niet nodig.</p>
      <div className="sm:col-span-2">
        <label htmlFor={`${pre}-notitie`} className="field-label">
          Notitie (hoogstens 300 tekens)
        </label>
        <textarea id={`${pre}-notitie`} className="field-input" rows={2} value={notitie} maxLength={300} onChange={(e) => setNotitie(e.target.value)} />
      </div>
      {fout && (
        <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit sm:col-span-2">
          {fout}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={bezig}>
          {bezig ? "Bewaren…" : "Bewaar lid"}
        </button>
        <button type="button" className="rounded-lg border border-hairstrong px-3 py-1.5 text-sm font-semibold text-ink hover:border-brand-500" onClick={annuleer}>
          Annuleren
        </button>
      </div>
    </form>
  );
}
