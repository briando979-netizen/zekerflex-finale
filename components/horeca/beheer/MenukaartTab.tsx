"use client";

import { useState, type FormEvent } from "react";
import { bedragVeld, centVan } from "@/components/rijschool/api";
import { Veld } from "@/components/rijschool/ui";
import { ALLERGENEN, type Allergeen } from "@/lib/horeca/allergenen";
import { euro } from "@/lib/horeca/weergave";
import type { BeheerData, Doe, Item } from "@/components/horeca/beheer/types";
import { leesOptieTekst, leesOpties, optieTekst } from "@/lib/horeca/opties";

// De menukaart: categorieën met gerechten en dranken. Per gerecht prijs,
// allergenen, vegetarisch/veganistisch, keuken of bar (waar een bestelling
// heen gaat) en snel "uitverkocht".

type Concept = Omit<Item, "id" | "volgorde" | "prijsCent" | "opties" | "voorraad"> & { id?: string; prijs: string; optiesTekst: string; voorraadTekst: string };

const leeg = (categorieId: string | null): Concept => ({
  categorieId,
  naam: "",
  omschrijving: "",
  prijs: "",
  allergenen: [],
  vegetarisch: false,
  veganistisch: false,
  beschikbaar: true,
  station: "keuken",
  btw: 9,
  optiesTekst: "",
  voorraadTekst: "",
});

export function MenukaartTab({ data, doe }: { data: BeheerData; doe: Doe }) {
  const [concept, setConcept] = useState<Concept | null>(null);
  const [nieuweCat, setNieuweCat] = useState("");
  const groepen = [
    ...data.categorieen.map((c) => ({ c, items: data.items.filter((i) => i.categorieId === c.id) })),
    { c: null, items: data.items.filter((i) => !i.categorieId) },
  ].filter((g) => g.c || g.items.length);

  async function voegCatToe(e: FormEvent) {
    e.preventDefault();
    if (await doe({ actie: "categorie", naam: nieuweCat }, `Categorie "${nieuweCat}" toegevoegd.`)) setNieuweCat("");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutralx-600">Per gerecht de allergenen; de wet vraagt dat je ze aan gasten kunt laten zien.</p>
        <a href="/werkgever/horeca/allergenen" target="_blank" rel="noopener" className="btn-ghost">
          Allergenenkaart printen
        </a>
      </div>
      {concept && <ItemFormulier concept={concept} data={data} doe={doe} sluit={() => setConcept(null)} />}
      {groepen.map(({ c, items }) => (
        <section key={c?.id ?? "zonder"} className="card p-5" aria-labelledby={`cat-${c?.id ?? "zonder"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`cat-${c?.id ?? "zonder"}`} className="font-display text-lg font-bold text-ink">
              {c?.naam ?? "Zonder categorie"}
            </h2>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConcept(leeg(c?.id ?? null))}>
                + Gerecht
              </button>
              {c && (
                <button
                  type="button"
                  className="btn-ghost text-crit"
                  aria-label={`Categorie ${c.naam} verwijderen`}
                  onClick={() => {
                    if (window.confirm(`Categorie "${c.naam}" verwijderen? De gerechten blijven, zonder categorie.`)) void doe({ actie: "categorie-weg", id: c.id }, "Categorie verwijderd.");
                  }}
                >
                  Verwijderen
                </button>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-neutralx-500">Nog niets in deze categorie.</p>
          ) : (
            <ul className="mt-3 divide-y divide-hair">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold text-ink ${i.beschikbaar ? "" : "line-through opacity-60"}`}>
                      {i.naam} <span className="font-normal text-neutralx-600">· {euro(i.prijsCent)}</span>
                      {!i.beschikbaar && <span className="pill-warn ml-2 no-underline">uitverkocht</span>}
                    </p>
                    {i.omschrijving && <p className="text-sm text-neutralx-600">{i.omschrijving}</p>}
                    <p className="mt-0.5 text-xs text-neutralx-500">
                      {i.station === "bar" ? "Naar de bar" : "Naar de keuken"}
                      {i.veganistisch ? " · veganistisch" : i.vegetarisch ? " · vegetarisch" : ""}
                      {i.allergenen.length > 0 && ` · bevat ${i.allergenen.map((a) => ALLERGENEN[a as Allergeen]?.toLowerCase() ?? a).join(", ")}`}
                      {` · btw ${i.btw} %`}
                      {i.voorraad !== null && ` · nog ${i.voorraad}`}
                      {leesOpties(i.opties).length > 0 && ` · keuzes: ${leesOpties(i.opties).map((g) => g.naam.toLowerCase()).join(", ")}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost" onClick={() => void doe({ actie: "beschikbaar", id: i.id, beschikbaar: !i.beschikbaar }, i.beschikbaar ? `${i.naam} staat op uitverkocht.` : `${i.naam} is weer te bestellen.`)}>
                      {i.beschikbaar ? "Uitverkocht" : "Weer leverbaar"}
                    </button>
                    <button type="button" className="btn-ghost" aria-label={`${i.naam} bewerken`} onClick={() => setConcept({ ...i, prijs: bedragVeld(i.prijsCent), optiesTekst: optieTekst(leesOpties(i.opties)), voorraadTekst: i.voorraad === null ? "" : String(i.voorraad) })}>
                      Bewerken
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <form onSubmit={(e) => void voegCatToe(e)} className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[14rem] flex-1">
          <Veld label="Nieuwe categorie">
            <input className="field-input" value={nieuweCat} onChange={(e) => setNieuweCat(e.target.value)} required maxLength={60} placeholder="Bijvoorbeeld Lunch" />
          </Veld>
        </div>
        <button type="submit" className="btn-primary">
          Toevoegen
        </button>
      </form>
    </div>
  );
}

function ItemFormulier({ concept, data, doe, sluit }: { concept: Concept; data: BeheerData; doe: Doe; sluit: () => void }) {
  const [v, setV] = useState<Concept>(concept);
  const [fout, setFout] = useState("");
  const zet = <K extends keyof Concept>(k: K, w: Concept[K]) => setV((x) => ({ ...x, [k]: w }));

  async function bewaar(e: FormEvent) {
    e.preventDefault();
    const prijsCent = centVan(v.prijs);
    if (prijsCent === null) return setFout("Vul een prijs in, bijvoorbeeld 12,50.");
    const voorraad = v.voorraadTekst.trim() === "" ? null : Number(v.voorraadTekst);
    if (voorraad !== null && (!Number.isInteger(voorraad) || voorraad < 0)) return setFout("Vul bij voorraad een heel getal in, of laat het leeg voor onbeperkt.");
    const opties = leesOptieTekst(v.optiesTekst);
    if (v.optiesTekst.trim() && !opties.length) return setFout("De keuzes zijn niet te lezen. Schrijf per regel bijvoorbeeld: Bakwijze*: Rare, Medium, Well done");
    setFout("");
    const { prijs: _p, optiesTekst: _o, voorraadTekst: _v, ...rest } = v;
    if (await doe({ actie: "item", ...rest, prijsCent, opties, voorraad }, `${v.naam} is bewaard.`)) sluit();
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className="card space-y-4 p-5" aria-labelledby="item-kop">
      <h2 id="item-kop" className="font-display text-lg font-bold text-ink">
        {v.id ? `${concept.naam} bewerken` : "Nieuw gerecht of drankje"}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Veld label="Naam">
          <input className="field-input" value={v.naam} onChange={(e) => zet("naam", e.target.value)} required maxLength={80} />
        </Veld>
        <Veld label="Prijs (€)">
          <input className="field-input" inputMode="decimal" value={v.prijs} onChange={(e) => zet("prijs", e.target.value)} required placeholder="12,50" />
        </Veld>
        <Veld label="Omschrijving (mag leeg)">
          <input className="field-input" value={v.omschrijving} onChange={(e) => zet("omschrijving", e.target.value)} maxLength={300} />
        </Veld>
        <Veld label="Categorie">
          <select className="field-input" value={v.categorieId ?? ""} onChange={(e) => zet("categorieId", e.target.value || null)}>
            <option value="">Zonder categorie</option>
            {data.categorieen.map((c) => (
              <option key={c.id} value={c.id}>
                {c.naam}
              </option>
            ))}
          </select>
        </Veld>
        <Veld label="Bestelling gaat naar">
          <select className="field-input" value={v.station} onChange={(e) => zet("station", e.target.value)}>
            <option value="keuken">Keuken</option>
            <option value="bar">Bar</option>
          </select>
        </Veld>
        <Veld label="Voorraad (mag leeg)" uitleg="Leeg = onbeperkt. Bij 0 is het gerecht vanzelf uitverkocht; elke bestelling telt af.">
          <input className="field-input" inputMode="numeric" value={v.voorraadTekst} onChange={(e) => zet("voorraadTekst", e.target.value.replace(/[^0-9]/g, ""))} placeholder="onbeperkt" />
        </Veld>
        <Veld label="Btw (voor de kassabon)" uitleg="9 % voor eten en alcoholvrije dranken, 21 % voor alcohol">
          <select className="field-input" value={String(v.btw ?? 9)} onChange={(e) => zet("btw", Number(e.target.value))}>
            <option value="9">9 % (laag tarief)</option>
            <option value="21">21 % (alcohol)</option>
            <option value="0">0 %</option>
          </select>
        </Veld>
        <fieldset className="flex flex-wrap items-center gap-4 pt-6 text-sm">
          <legend className="sr-only">Dieet</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={v.vegetarisch || v.veganistisch} onChange={(e) => zet("vegetarisch", e.target.checked)} disabled={v.veganistisch} />
            Vegetarisch
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={v.veganistisch} onChange={(e) => zet("veganistisch", e.target.checked)} />
            Veganistisch
          </label>
        </fieldset>
      </div>
      <Veld label="Keuzes bij bestellen (mag leeg)" uitleg="Eén groep per regel. * = verplicht, + = meer keuzes tegelijk, meerprijs tussen haakjes. Voorbeeld: Bakwijze*: Rare, Medium, Well done — Extra's+: Bacon (+1,50), Kaas (+1,00)">
        <textarea className="field-input min-h-24 font-mono text-sm" value={v.optiesTekst} onChange={(e) => zet("optiesTekst", e.target.value)} maxLength={2000} placeholder={"Bakwijze*: Rare, Medium, Well done\nSaus: Pepersaus, Champignonsaus (+1,00)"} />
      </Veld>
      <fieldset>
        <legend className="field-label">Allergenen</legend>
        <div className="mt-1 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {(Object.entries(ALLERGENEN) as [Allergeen, string][]).map(([k, naam]) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={v.allergenen.includes(k)}
                onChange={(e) => zet("allergenen", e.target.checked ? [...v.allergenen, k] : v.allergenen.filter((a) => a !== k))}
              />
              {naam}
            </label>
          ))}
        </div>
      </fieldset>
      {fout && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-crit">
          {fout}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary">
          Bewaren
        </button>
        <button type="button" className="btn-ghost" onClick={sluit}>
          Annuleren
        </button>
        {v.id && (
          <button
            type="button"
            className="btn-ghost ml-auto text-crit"
            onClick={() => {
              if (window.confirm(`${concept.naam} van de kaart halen?`)) void doe({ actie: "item-weg", id: v.id }, `${concept.naam} is van de kaart gehaald.`).then((g) => g && sluit());
            }}
          >
            Van de kaart halen
          </button>
        )}
      </div>
    </form>
  );
}
