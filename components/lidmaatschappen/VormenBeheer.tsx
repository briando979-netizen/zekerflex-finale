"use client";

import { useState } from "react";
import { SOORTEN, SOORT_NAAM, euroTekst, isLooptijd, type Soort, type Vorm } from "@/lib/lidmaatschappen/model";
import { leesFout } from "@/components/voorraad/fout";

// De vormen van het bedrijf: abonnement per week, maand of jaar, en strippenkaarten. Een wijziging van een vorm raakt
// bestaande lidmaatschappen niet: die houden de prijs en voorwaarden van het moment van afsluiten.

const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500 disabled:opacity-40";
const euroVeld = (c: number) => (c / 100).toFixed(2).replace(".", ",");
/** "12,50" → 1250 centen; leeg → 0; onzin → NaN. */
const centUitVeld = (s: string): number => {
  const t = s.trim().replace(",", ".");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Number.NaN;
};

function omschrijving(v: Vorm): string {
  if (isLooptijd(v.soort)) {
    const eenheid = v.soort === "week" ? "week" : v.soort === "maand" ? "maand" : "jaar";
    return `${euroTekst(v.prijsCent)} per ${eenheid}${v.looptijdPerioden === null ? ", doorlopend" : `, ${v.looptijdPerioden} ${v.looptijdPerioden === 1 ? "periode" : "perioden"}`}`;
  }
  return `${v.strippen ?? 0} bezoeken, ${v.geldigheidMaanden ?? 0} ${v.geldigheidMaanden === 1 ? "maand" : "maanden"} geldig${v.prijsCent > 0 ? `, ${euroTekst(v.prijsCent)}` : ""}`;
}

function VormFormulier({ begin, opgeslagen, annuleer }: { begin?: Vorm; opgeslagen: (v: Vorm) => void; annuleer: () => void }) {
  const [naam, setNaam] = useState(begin?.naam ?? "");
  const [soort, setSoort] = useState<Soort>(begin?.soort ?? "maand");
  const [prijs, setPrijs] = useState(begin ? euroVeld(begin.prijsCent) : "");
  const [inschrijfgeld, setInschrijfgeld] = useState(begin ? euroVeld(begin.inschrijfgeldCent) : "");
  const [perioden, setPerioden] = useState(begin?.looptijdPerioden != null ? String(begin.looptijdPerioden) : "");
  const [strippen, setStrippen] = useState(begin?.strippen != null ? String(begin.strippen) : "10");
  const [maanden, setMaanden] = useState(begin?.geldigheidMaanden != null ? String(begin.geldigheidMaanden) : "6");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const pre = begin ? `vorm-${begin.id}` : "vorm-nieuw";
  const looptijd = isLooptijd(soort);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    const prijsCent = centUitVeld(prijs);
    const inschrijfgeldCent = centUitVeld(inschrijfgeld);
    if (Number.isNaN(prijsCent) || Number.isNaN(inschrijfgeldCent)) {
      setFout("Een bedrag klopt niet. Vul bijvoorbeeld 29,50 in.");
      return;
    }
    setBezig(true);
    try {
      const res = await fetch("/api/werkgever/lidmaatschappen", {
        method: begin ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "vorm", ...(begin ? { id: begin.id, actie: "bewerken" } : {}), naam, soort, prijsCent, inschrijfgeldCent, ...(looptijd ? { looptijdPerioden: perioden } : { strippen, geldigheidMaanden: maanden }) }),
      });
      if (!res.ok) {
        setFout(await leesFout(res, "De vorm kon niet worden bewaard."));
        return;
      }
      opgeslagen(((await res.json()) as { vorm: Vorm }).vorm);
    } catch {
      setFout("De vorm kon niet worden bewaard. Controleer je verbinding.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${pre}-naam`} className="field-label">
          Naam
        </label>
        <input id={`${pre}-naam`} className="field-input" value={naam} maxLength={60} required onChange={(e) => setNaam(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${pre}-soort`} className="field-label">
          Soort
        </label>
        <select id={`${pre}-soort`} className="field-input" value={soort} onChange={(e) => setSoort(e.target.value as Soort)}>
          {SOORTEN.map((s) => (
            <option key={s} value={s}>
              {SOORT_NAAM[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${pre}-prijs`} className="field-label">
          {looptijd ? "Prijs per periode in euro, incl. btw" : "Prijs van de kaart in euro, incl. btw (niet verplicht)"}
        </label>
        <input id={`${pre}-prijs`} className="field-input" inputMode="decimal" value={prijs} required={looptijd} onChange={(e) => setPrijs(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${pre}-inschrijf`} className="field-label">
          Inschrijfgeld in euro (niet verplicht)
        </label>
        <input id={`${pre}-inschrijf`} className="field-input" inputMode="decimal" value={inschrijfgeld} onChange={(e) => setInschrijfgeld(e.target.value)} />
      </div>
      {looptijd ? (
        <div>
          <label htmlFor={`${pre}-perioden`} className="field-label">
            Aantal perioden (leeg = doorlopend)
          </label>
          <input id={`${pre}-perioden`} className="field-input" inputMode="numeric" value={perioden} onChange={(e) => setPerioden(e.target.value)} />
        </div>
      ) : (
        <>
          <div>
            <label htmlFor={`${pre}-strippen`} className="field-label">
              Aantal bezoeken op de kaart
            </label>
            <input id={`${pre}-strippen`} className="field-input" inputMode="numeric" value={strippen} required onChange={(e) => setStrippen(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${pre}-maanden`} className="field-label">
              Geldig (maanden)
            </label>
            <input id={`${pre}-maanden`} className="field-input" inputMode="numeric" value={maanden} required onChange={(e) => setMaanden(e.target.value)} />
          </div>
        </>
      )}
      <p className="text-xs text-neutralx-500 sm:col-span-2">Prijzen en inschrijfgeld zijn alleen ter informatie: je int ze zelf, buiten ZekerFlex.</p>
      {fout && (
        <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit sm:col-span-2">
          {fout}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={bezig}>
          {bezig ? "Bewaren…" : "Bewaar vorm"}
        </button>
        <button type="button" className={knopKlein} onClick={annuleer}>
          Annuleren
        </button>
      </div>
    </form>
  );
}

export function VormenBeheer({ vormen, vervang }: { vormen: Vorm[]; vervang: (v: Vorm) => void }) {
  const [nieuw, setNieuw] = useState(false);
  const [bewerk, setBewerk] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function archief(v: Vorm, actie: "archiveren" | "terughalen") {
    setFout(null);
    try {
      const res = await fetch("/api/werkgever/lidmaatschappen", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "vorm", id: v.id, actie }) });
      if (!res.ok) {
        setFout(await leesFout(res, "De wijziging is niet gelukt."));
        return;
      }
      vervang(((await res.json()) as { vorm: Vorm }).vorm);
    } catch {
      setFout("De wijziging is niet gelukt. Controleer je verbinding.");
    }
  }

  return (
    <div className="space-y-3">
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      <button type="button" className="btn-primary" onClick={() => setNieuw((v) => !v)}>
        {nieuw ? "Sluiten" : "Vorm toevoegen"}
      </button>
      {nieuw && (
        <div className="rounded-xl border border-hair bg-white p-4">
          <h2 className="mb-3 font-display text-base font-bold text-ink">Nieuwe vorm</h2>
          <VormFormulier
            opgeslagen={(v) => {
              vervang(v);
              setNieuw(false);
            }}
            annuleer={() => setNieuw(false)}
          />
        </div>
      )}
      {vormen.length === 0 ? (
        <p className="rounded-xl border border-hair bg-white px-4 py-6 text-center text-sm text-neutralx-600">Je hebt nog geen vormen. Voeg bijvoorbeeld een maandabonnement of een tienrittenkaart toe.</p>
      ) : (
        <ul className="space-y-2">
          {vormen.map((v) => (
            <li key={v.id} className="rounded-xl border border-hair bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">
                    {v.naam}
                    {v.gearchiveerd && <span className="ml-2 rounded bg-paper-soft px-1.5 py-0.5 text-xs font-normal text-neutralx-600">Gearchiveerd</span>}
                  </p>
                  <p className="text-xs text-neutralx-500">
                    {SOORT_NAAM[v.soort]}: {omschrijving(v)}
                    {v.inschrijfgeldCent > 0 ? `, inschrijfgeld ${euroTekst(v.inschrijfgeldCent)}` : ""}
                  </p>
                </div>
                <button type="button" className={knopKlein} onClick={() => setBewerk(bewerk === v.id ? null : v.id)}>
                  {bewerk === v.id ? "Sluiten" : "Bewerken"}
                </button>
                <button type="button" className={knopKlein} onClick={() => void archief(v, v.gearchiveerd ? "terughalen" : "archiveren")}>
                  {v.gearchiveerd ? "Terughalen" : "Archiveren"}
                </button>
              </div>
              {bewerk === v.id && (
                <div className="mt-3 border-t border-hair pt-3">
                  <VormFormulier
                    begin={v}
                    opgeslagen={(x) => {
                      vervang(x);
                      setBewerk(null);
                    }}
                    annuleer={() => setBewerk(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
