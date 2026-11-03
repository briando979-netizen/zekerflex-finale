"use client";

import { useState, type FormEvent } from "react";
import { Veld } from "@/components/rijschool/ui";
import type { BeheerData, Doe, Tafel } from "@/components/horeca/beheer/types";

// Tafels met hun QR-code. "QR vernieuwen" maakt de geprinte code ongeldig
// (bijvoorbeeld als een foto ervan rondgaat). Printen gaat via een aparte pagina.

type Concept = { id?: string; naam: string; plaatsen: string; zone: string; actief: boolean };

export function TafelsTab({ data, doe }: { data: BeheerData; doe: Doe }) {
  const [concept, setConcept] = useState<Concept | null>(null);
  const tafels = data.tafels;

  async function bewaar(e: FormEvent) {
    e.preventDefault();
    if (!concept) return;
    const plaatsen = Number(concept.plaatsen);
    if (await doe({ actie: "tafel", ...concept, plaatsen: Number.isInteger(plaatsen) && plaatsen > 0 ? plaatsen : 4 }, `${concept.naam} is bewaard.`)) setConcept(null);
  }

  async function tienTafels() {
    const start = tafels.length + 1;
    for (let i = start; i < start + 10; i++) {
      if (!(await doe({ actie: "tafel", naam: `Tafel ${i}`, plaatsen: 4, zone: "", actief: true }))) return;
    }
  }

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Tafels en QR-codes</h2>
          <p className="text-sm text-neutralx-600">Elke tafel krijgt een eigen QR-code. Gasten scannen hem en bestellen zelf van de menukaart.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => setConcept({ naam: `Tafel ${tafels.length + 1}`, plaatsen: "4", zone: "", actief: true })}>
            + Tafel
          </button>
          {tafels.length === 0 && (
            <button type="button" className="btn-ghost" onClick={() => void tienTafels()}>
              Tien tafels in één keer
            </button>
          )}
          {tafels.length > 0 && (
            <a href="/werkgever/horeca/qr" target="_blank" rel="noopener" className="btn-primary">
              QR-codes printen
            </a>
          )}
        </div>
      </section>

      {concept && (
        <form onSubmit={(e) => void bewaar(e)} className="card grid gap-4 p-5 sm:grid-cols-4" aria-label="Tafel bewaren">
          <Veld label="Naam of nummer">
            <input className="field-input" value={concept.naam} onChange={(e) => setConcept({ ...concept, naam: e.target.value })} required maxLength={30} />
          </Veld>
          <Veld label="Plaatsen">
            <input className="field-input" type="number" min={1} max={40} value={concept.plaatsen} onChange={(e) => setConcept({ ...concept, plaatsen: e.target.value })} required />
          </Veld>
          <Veld label="Zone (mag leeg)">
            <input className="field-input" value={concept.zone} onChange={(e) => setConcept({ ...concept, zone: e.target.value })} maxLength={30} placeholder="Terras" />
          </Veld>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary">
              Bewaren
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConcept(null)}>
              Annuleren
            </button>
          </div>
        </form>
      )}

      {tafels.length > 0 && (
        <ul className="card divide-y divide-hair">
          {tafels.map((t: Tafel) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-ink">
                  {t.naam}
                  {!t.actief && <span className="pill-warn ml-2">uit</span>}
                </p>
                <p className="text-sm text-neutralx-600">
                  {t.plaatsen} plaatsen{t.zone && ` · ${t.zone}`} ·{" "}
                  <a href={`/horeca/${data.zaak.slug}/tafel/${t.code}`} target="_blank" rel="noopener" className="font-medium text-brand-600 hover:underline">
                    Bestelpagina
                  </a>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost" aria-label={`${t.naam} bewerken`} onClick={() => setConcept({ id: t.id, naam: t.naam, plaatsen: String(t.plaatsen), zone: t.zone, actief: t.actief })}>
                  Bewerken
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  aria-label={`Nieuwe QR-code voor ${t.naam}`}
                  onClick={() => {
                    if (window.confirm(`Nieuwe QR-code voor ${t.naam}? De geprinte code werkt dan niet meer.`)) void doe({ actie: "tafel-code", id: t.id }, `${t.naam} heeft een nieuwe QR-code. Print hem opnieuw.`);
                  }}
                >
                  QR vernieuwen
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void doe({ actie: "tafel", id: t.id, naam: t.naam, plaatsen: t.plaatsen, zone: t.zone, actief: !t.actief }, t.actief ? `${t.naam} staat uit.` : `${t.naam} staat aan.`)}
                >
                  {t.actief ? "Uitzetten" : "Aanzetten"}
                </button>
                <button
                  type="button"
                  className="btn-ghost text-crit"
                  aria-label={`${t.naam} verwijderen`}
                  onClick={() => {
                    if (window.confirm(`${t.naam} verwijderen?`)) void doe({ actie: "tafel-weg", id: t.id }, `${t.naam} is verwijderd.`);
                  }}
                >
                  Verwijderen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
