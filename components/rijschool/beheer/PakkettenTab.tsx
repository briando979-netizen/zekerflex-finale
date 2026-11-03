"use client";

import { useState } from "react";
import type { BeheerWeergave, ProductRij } from "@/lib/rijschool/weergave";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";
import { bedragVeld, centVan, foutVan } from "@/components/rijschool/api";
import { Melding, Schakelaar, Veld } from "@/components/rijschool/ui";
import { euro } from "@/lib/payroll/format";

// Pakketten en prijzen: wat op de website en in de leerling-app staat, en wat
// er bij een betaling aan lestegoed bij komt.

type Soort = "LES" | "PAKKET" | "EXAMEN" | "PROEFLES" | "OVERIG";

const SOORTEN: { id: Soort; label: string }[] = [
  { id: "PAKKET", label: "Lespakket" },
  { id: "LES", label: "Losse les" },
  { id: "PROEFLES", label: "Proefles" },
  { id: "EXAMEN", label: "Examen" },
  { id: "OVERIG", label: "Overig" },
];

const NIEUW: Omit<ProductRij, "id"> = {
  naam: "",
  omschrijving: "",
  soort: "PAKKET",
  prijsCent: 0,
  lessen: 10,
  lesMinuten: 60,
  examen: false,
  zichtbaar: true,
  populair: false,
  volgorde: 10,
};

export function PakkettenTab({ data, doe }: { data: BeheerWeergave; doe: Doe }) {
  const [bewerk, setBewerk] = useState<ProductRij | "nieuw" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-neutralx-600">
          Bij het aanzetten zijn er voorbeeldpakketten met voorbeeldprijzen gemaakt. Pas ze aan naar je eigen prijzen voordat je website online gaat.
        </p>
        <button type="button" className="btn-primary" onClick={() => setBewerk("nieuw")}>
          Pakket toevoegen
        </button>
      </div>
      {bewerk && <ProductFormulier key={bewerk === "nieuw" ? "nieuw" : bewerk.id} doe={doe} product={bewerk === "nieuw" ? null : bewerk} onKlaar={() => setBewerk(null)} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.producten.map((p) => (
          <button key={p.id} type="button" onClick={() => setBewerk(p)} className={`card p-5 text-left transition hover:border-brand-300 ${p.zichtbaar ? "" : "opacity-60"}`}>
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold text-ink">{p.naam}</span>
              {p.populair && <span className="pill-ok">Populair</span>}
            </span>
            <span className="num mt-1 block font-display text-2xl font-bold text-ink">{euro(p.prijsCent)}</span>
            <span className="mt-1 block text-sm text-neutralx-600">{p.omschrijving}</span>
            <span className="mt-2 block text-xs text-neutralx-500">
              {SOORTEN.find((s) => s.id === p.soort)?.label}
              {p.lessen > 0 ? ` · ${p.lessen} × ${p.lesMinuten} min tegoed` : ""}
              {p.examen ? " · met examen" : ""}
              {p.zichtbaar ? "" : " · verborgen"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductFormulier({ doe, product, onKlaar }: { doe: Doe; product: ProductRij | null; onKlaar: () => void }) {
  const [v, setV] = useState(product ?? NIEUW);
  const [prijs, setPrijs] = useState(product ? bedragVeld(product.prijsCent) : "");
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    const prijsCent = centVan(prijs);
    if (prijsCent === null) return setFout("Vul een prijs in, bijvoorbeeld 595 of 62,50.");
    try {
      await doe({
        actie: "product",
        id: product?.id ?? null,
        data: {
          naam: v.naam,
          omschrijving: v.omschrijving,
          soort: v.soort as Soort,
          prijsCent,
          lessen: v.lessen,
          lesMinuten: v.lesMinuten,
          examen: v.examen,
          zichtbaar: v.zichtbaar,
          populair: v.populair,
          volgorde: v.volgorde,
        },
      });
      onKlaar();
    } catch (err) {
      setFout(foutVan(err));
    }
  }

  async function weg() {
    if (!product || !window.confirm(`${product.naam} verwijderen? Eerdere betalingen blijven bewaard.`)) return;
    try {
      await doe({ actie: "productWeg", id: product.id });
      onKlaar();
    } catch (err) {
      setFout(foutVan(err));
    }
  }

  return (
    <form onSubmit={bewaar} className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2">
        <Veld label="Naam">
          <input className="field-input" value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} required minLength={2} maxLength={80} />
        </Veld>
      </div>
      <Veld label="Soort">
        <select className="field-input" value={v.soort} onChange={(e) => setV({ ...v, soort: e.target.value })}>
          {SOORTEN.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Veld>
      <Veld label="Prijs (€, incl. btw)">
        <input className="field-input" inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} required />
      </Veld>
      <div className="sm:col-span-2 lg:col-span-4">
        <Veld label="Omschrijving">
          <input className="field-input" value={v.omschrijving} onChange={(e) => setV({ ...v, omschrijving: e.target.value })} maxLength={400} />
        </Veld>
      </div>
      <Veld label="Aantal lessen tegoed" uitleg="0 als het pakket geen lessen geeft (bijvoorbeeld een examen).">
        <input className="field-input" type="number" min={0} max={200} value={v.lessen} onChange={(e) => setV({ ...v, lessen: Number(e.target.value) })} />
      </Veld>
      <Veld label="Minuten per les">
        <input className="field-input" type="number" min={30} max={180} step={5} value={v.lesMinuten} onChange={(e) => setV({ ...v, lesMinuten: Number(e.target.value) })} />
      </Veld>
      <Veld label="Volgorde" uitleg="Lager staat eerder.">
        <input className="field-input" type="number" min={0} max={999} value={v.volgorde} onChange={(e) => setV({ ...v, volgorde: Number(e.target.value) })} />
      </Veld>
      <div className="space-y-2 sm:col-span-2 lg:col-span-4 lg:grid lg:grid-cols-3 lg:gap-2 lg:space-y-0">
        <Schakelaar label="Inclusief praktijkexamen" aan={v.examen} onChange={(examen) => setV({ ...v, examen })} />
        <Schakelaar label="Op de website en in de app" aan={v.zichtbaar} onChange={(zichtbaar) => setV({ ...v, zichtbaar })} />
        <Schakelaar label="Uitlichten als populair" aan={v.populair} onChange={(populair) => setV({ ...v, populair })} />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <Melding fout={fout} />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className="btn-primary">
          Opslaan
        </button>
        {product && (
          <button type="button" className="btn-ghost text-crit" onClick={weg}>
            Verwijderen
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onKlaar}>
          Sluiten
        </button>
      </div>
    </form>
  );
}
