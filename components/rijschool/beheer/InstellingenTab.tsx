"use client";

import { useState } from "react";
import type { BeheerWeergave } from "@/lib/rijschool/weergave";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";
import { foutVan } from "@/components/rijschool/api";
import { Melding, Schakelaar, Veld } from "@/components/rijschool/ui";

// Gegevens en spelregels van de rijschool, en de knop om de website online te
// zetten. Adres en KVK-nummer horen volgens de wet op een zakelijke website.

export function InstellingenTab({ data, doe }: { data: BeheerWeergave; doe: Doe }) {
  const r = data.rijschool;
  const [v, setV] = useState({
    naam: r.naam,
    plaats: r.plaats,
    adres: r.adres,
    telefoon: r.telefoon,
    email: r.email,
    kvk: r.kvk,
    kleur: r.kleur,
    accent: r.accent,
    lesMinuten: r.lesMinuten,
    annuleerUren: r.annuleerUren,
    proeflesOnline: r.proeflesOnline,
    zelfPlannen: r.zelfPlannen,
    online: r.online,
  });
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setOk(null);
    if (v.online && (!v.adres.trim() || !v.kvk.trim())) {
      return setFout("Vul je adres en KVK-nummer in voordat je de website online zet; die moeten op een zakelijke website staan.");
    }
    setBezig(true);
    try {
      await doe({ actie: "instellingen", data: { ...v, kvk: v.kvk.replace(/\D/g, "") } });
      setOk(v.online && !r.online ? "Opgeslagen. Je website staat nu online." : "Opgeslagen.");
    } catch (err) {
      setFout(foutVan(err));
    } finally {
      setBezig(false);
    }
  }

  return (
    <form onSubmit={bewaar} className="grid gap-5 lg:grid-cols-2">
      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold text-ink sm:col-span-2">Gegevens</h2>
        <Veld label="Naam">
          <input className="field-input" value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} required minLength={2} maxLength={100} />
        </Veld>
        <Veld label="Plaats">
          <input className="field-input" value={v.plaats} onChange={(e) => setV({ ...v, plaats: e.target.value })} maxLength={80} />
        </Veld>
        <div className="sm:col-span-2">
          <Veld label="Adres (straat, huisnummer, postcode)">
            <input className="field-input" value={v.adres} onChange={(e) => setV({ ...v, adres: e.target.value })} maxLength={160} />
          </Veld>
        </div>
        <Veld label="Telefoon">
          <input className="field-input" type="tel" value={v.telefoon} onChange={(e) => setV({ ...v, telefoon: e.target.value })} maxLength={30} />
        </Veld>
        <Veld label="E-mail" uitleg="Leerlingen die op een mail antwoorden, komen hier uit.">
          <input className="field-input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} maxLength={200} />
        </Veld>
        <Veld label="KVK-nummer">
          <input className="field-input" inputMode="numeric" value={v.kvk} onChange={(e) => setV({ ...v, kvk: e.target.value })} maxLength={8} />
        </Veld>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Hoofdkleur">
            <input className="field-input h-11 p-1" type="color" value={v.kleur} onChange={(e) => setV({ ...v, kleur: e.target.value })} />
          </Veld>
          <Veld label="Accentkleur">
            <input className="field-input h-11 p-1" type="color" value={v.accent} onChange={(e) => setV({ ...v, accent: e.target.value })} />
          </Veld>
        </div>
      </section>

      <section className="card grid content-start gap-4 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Lessen en website</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Veld label="Standaard lesduur (minuten)">
            <input className="field-input" type="number" min={30} max={180} step={5} value={v.lesMinuten} onChange={(e) => setV({ ...v, lesMinuten: Number(e.target.value) })} />
          </Veld>
          <Veld label="Kosteloos annuleren tot (uur vooraf)">
            <input className="field-input" type="number" min={0} max={168} value={v.annuleerUren} onChange={(e) => setV({ ...v, annuleerUren: Number(e.target.value) })} />
          </Veld>
        </div>
        <Schakelaar label="Proefles online plannen" uitleg="Bezoekers kiezen zelf een vrije tijd bij een instructeur." aan={v.proeflesOnline} onChange={(proeflesOnline) => setV({ ...v, proeflesOnline })} />
        <Schakelaar
          label="Leerlingen plannen zelf lessen"
          uitleg="In de app kiezen leerlingen een vrije tijd bij hun vaste instructeur, als hun tegoed het toelaat."
          aan={v.zelfPlannen}
          onChange={(zelfPlannen) => setV({ ...v, zelfPlannen })}
        />
        <Schakelaar label="Website online" uitleg="Uit: alleen jij ziet de website. Aan: iedereen kan hem bezoeken." aan={v.online} onChange={(online) => setV({ ...v, online })} />
      </section>

      <div className="space-y-3 lg:col-span-2">
        <Melding fout={fout} ok={ok} />
        <button type="submit" className="btn-primary" disabled={bezig}>
          {bezig ? "Bezig…" : "Opslaan"}
        </button>
      </div>
    </form>
  );
}
