"use client";

import { useState, type FormEvent } from "react";
import { Veld } from "@/components/rijschool/ui";
import { SOORTEN, SOORT_LABEL } from "@/lib/horeca/soorten";
import { DAGEN, type Dag, type Openingstijden } from "@/lib/horeca/tijden";
import type { BeheerData, Doe } from "@/components/horeca/beheer/types";

// Gegevens van de zaak (naam, contact, kleuren, teksten op de site) en de
// openingstijden per dag. Een tot vóór de van loopt door na middernacht.

export function GegevensTab({ data, doe }: { data: BeheerData; doe: Doe }) {
  const z = data.zaak;
  const [g, setG] = useState({ naam: z.naam, soort: z.soort, plaats: z.plaats, adres: z.adres, telefoon: z.telefoon, email: z.email, kvk: z.kvk, kleur: z.kleur, accent: z.accent, kop: z.kop, intro: z.intro });
  const [tijden, setTijden] = useState<Openingstijden>(z.openingstijden);
  const zet = (k: keyof typeof g) => (e: { target: { value: string } }) => setG((x) => ({ ...x, [k]: e.target.value }));
  const zetDag = (d: Dag, w: { van: string; tot: string } | null) => setTijden((t) => ({ ...t, [d]: w }));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form
        className="card space-y-4 p-5"
        aria-labelledby="gegevens-kop"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void doe({ actie: "gegevens", ...g }, "De gegevens zijn bewaard.");
        }}
      >
        <h2 id="gegevens-kop" className="font-display text-lg font-bold text-ink">
          Gegevens en site
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Veld label="Naam">
            <input className="field-input" value={g.naam} onChange={zet("naam")} required minLength={2} maxLength={80} />
          </Veld>
          <Veld label="Soort zaak">
            <select className="field-input" value={g.soort} onChange={zet("soort")}>
              {SOORTEN.map((s) => (
                <option key={s} value={s}>
                  {SOORT_LABEL[s]}
                </option>
              ))}
            </select>
          </Veld>
          <Veld label="Adres">
            <input className="field-input" value={g.adres} onChange={zet("adres")} maxLength={160} placeholder="Straat 1, 1234 AB" />
          </Veld>
          <Veld label="Plaats">
            <input className="field-input" value={g.plaats} onChange={zet("plaats")} maxLength={80} />
          </Veld>
          <Veld label="Telefoon">
            <input className="field-input" type="tel" value={g.telefoon} onChange={zet("telefoon")} maxLength={40} />
          </Veld>
          <Veld label="E-mail voor gasten">
            <input className="field-input" type="email" value={g.email} onChange={zet("email")} maxLength={200} />
          </Veld>
          <Veld label="KvK-nummer">
            <input className="field-input" value={g.kvk} onChange={zet("kvk")} maxLength={20} inputMode="numeric" />
          </Veld>
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Hoofdkleur">
              <input className="field-input h-11 p-1" type="color" value={g.kleur} onChange={zet("kleur")} />
            </Veld>
            <Veld label="Accentkleur">
              <input className="field-input h-11 p-1" type="color" value={g.accent} onChange={zet("accent")} />
            </Veld>
          </div>
        </div>
        <Veld label="Kop op de site (mag leeg)" uitleg="Bijvoorbeeld: Eten en drinken aan het water.">
          <input className="field-input" value={g.kop} onChange={zet("kop")} maxLength={120} />
        </Veld>
        <Veld label="Korte introductie (mag leeg)">
          <textarea className="field-input" rows={3} value={g.intro} onChange={zet("intro")} maxLength={600} />
        </Veld>
        <button type="submit" className="btn-primary">
          Bewaren
        </button>
      </form>

      <form
        className="card space-y-3 p-5"
        aria-labelledby="tijden-kop"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void doe({ actie: "openingstijden", tijden }, "De openingstijden zijn bewaard.");
        }}
      >
        <h2 id="tijden-kop" className="font-display text-lg font-bold text-ink">
          Openingstijden
        </h2>
        <p className="text-sm text-neutralx-600">Open tot na middernacht? Vul gewoon een sluittijd vóór de openingstijd in, bijvoorbeeld 17:00 tot 02:00.</p>
        {DAGEN.map(({ dag, naam }) => {
          const t = tijden[dag];
          return (
            <fieldset key={dag} className="flex flex-wrap items-center gap-3 rounded-lg border border-hair px-3 py-2">
              <legend className="sr-only">{naam}</legend>
              <label className="flex w-36 items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={t !== null} onChange={(e) => zetDag(dag, e.target.checked ? { van: "12:00", tot: "22:00" } : null)} />
                {naam}
              </label>
              {t ? (
                <span className="flex items-center gap-2 text-sm">
                  <input className="field-input w-28" type="time" aria-label={`${naam} open vanaf`} value={t.van} onChange={(e) => zetDag(dag, { ...t, van: e.target.value })} required />
                  tot
                  <input className="field-input w-28" type="time" aria-label={`${naam} open tot`} value={t.tot} onChange={(e) => zetDag(dag, { ...t, tot: e.target.value })} required />
                </span>
              ) : (
                <span className="text-sm text-neutralx-500">Gesloten</span>
              )}
            </fieldset>
          );
        })}
        <button type="submit" className="btn-primary">
          Openingstijden bewaren
        </button>
      </form>
    </div>
  );
}
