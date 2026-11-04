"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { STATUS_LABEL, VOLGENDE, VOLGENDE_KNOP, isOpen, regelsVoor, type BestelRegel, type BestelStatus } from "@/lib/horeca/bestellen";
import { euro } from "@/lib/horeca/weergave";
import type { BeheerData, Doe } from "@/components/horeca/beheer/types";

// Het keuken- en barscherm: open bestellingen per status, met per station
// alleen de eigen regels, ververst elke 8 seconden. De bediening voert hier
// ook zelf een bestelling in (telefoon, aan de bar).

const API = "/api/horeca/beheer";
type Station = "alles" | "keuken" | "bar";
interface Bestelling {
  id: string;
  nummer: number;
  status: BestelStatus;
  regels: BestelRegel[];
  totaalCent: number;
  opmerking: string;
  bron: string;
  tafelNaam: string | null;
  createdAt: string;
}

const KOLOMMEN: BestelStatus[] = ["NIEUW", "IN_BEREIDING", "KLAAR"];
const minutenGeleden = (iso: string, nu: number) => Math.max(0, Math.round((nu - Date.parse(iso)) / 60000));

export function BestellingenTab({ data, doe }: { data: BeheerData; doe: Doe }) {
  const [lijst, setLijst] = useState<Bestelling[] | null>(null);
  const [station, setStation] = useState<Station>("alles");
  const [fout, setFout] = useState<string | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  const [nieuw, setNieuw] = useState(false);

  const laad = useCallback(async () => {
    try {
      setLijst((await stuur<{ bestellingen: Bestelling[] }>(`${API}?alleen=bestellingen`)).bestellingen);
      setNu(Date.now());
      setFout(null);
    } catch (e) {
      setFout(foutVan(e));
    }
  }, []);
  useEffect(() => {
    void laad();
    const t = window.setInterval(() => void laad(), 8000);
    return () => window.clearInterval(t);
  }, [laad]);

  async function zet(b: Bestelling, status: BestelStatus) {
    try {
      setLijst((await stuur<{ bestellingen: Bestelling[] }>(API, "POST", { actie: "bestelstatus", id: b.id, status })).bestellingen);
    } catch (e) {
      setFout(foutVan(e));
    }
  }

  const zichtbaar = (lijst ?? []).filter((b) => regelsVoor(b.regels, station).length > 0);
  const afgerond = zichtbaar.filter((b) => !isOpen(b.status)).reverse().slice(0, 20);

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div role="group" aria-label="Scherm voor" className="flex gap-1">
          {(["alles", "keuken", "bar"] as Station[]).map((s) => (
            <button key={s} type="button" aria-pressed={station === s} onClick={() => setStation(s)} className={`rounded-full px-4 py-2 text-sm font-semibold ${station === s ? "bg-ink text-white" : "bg-white text-neutralx-600 ring-1 ring-hair"}`}>
              {s === "alles" ? "Alles" : s === "keuken" ? "Keuken" : "Bar"}
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary" onClick={() => setNieuw((v) => !v)} aria-expanded={nieuw}>
          {nieuw ? "Sluiten" : "+ Bestelling invoeren"}
        </button>
      </section>
      <Melding fout={fout} />
      {nieuw && <NieuweBestelling data={data} doe={doe} klaar={() => (setNieuw(false), void laad())} />}
      {lijst === null && <p className="text-sm text-neutralx-500">Laden…</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {KOLOMMEN.map((k) => {
          const kolom = zichtbaar.filter((b) => b.status === k);
          return (
            <section key={k} className="rounded-2xl bg-neutralx-50 p-3" aria-label={STATUS_LABEL[k]}>
              <h2 className="px-1 font-display text-lg font-bold text-ink">
                {STATUS_LABEL[k]} <span className="text-sm font-semibold text-neutralx-500">({kolom.length})</span>
              </h2>
              <ul className="mt-2 space-y-2">
                {kolom.length === 0 && <li className="px-1 text-sm text-neutralx-500">Niets.</li>}
                {kolom.map((b) => {
                  const volgende = VOLGENDE[b.status];
                  const min = minutenGeleden(b.createdAt, nu);
                  return (
                    <li key={b.id} className={`card p-4 ${min >= 20 && b.status !== "KLAAR" ? "ring-2 ring-amber-400" : ""}`}>
                      <p className="flex items-baseline justify-between gap-2">
                        <span className="font-display text-xl font-bold text-ink">#{b.nummer}</span>
                        <span className="text-sm text-neutralx-600">
                          {b.tafelNaam ?? "Zonder tafel"} · {min === 0 ? "net" : `${min} min`}
                        </span>
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-ink">
                        {regelsVoor(b.regels, station).map((r, i) => {
                          // keuken en bar melden elk hun eigen regels klaar (lib/horeca/fasen.ts)
                          const af = r.fase === "klaar" || r.fase === "geserveerd";
                          return (
                            <li key={i} className={af ? "text-neutralx-500" : undefined}>
                              {af && (
                                <span className="mr-1 font-bold text-ok" aria-hidden>
                                  ✓
                                </span>
                              )}
                              <strong>{r.aantal}×</strong> {r.naam}
                              {r.opmerking && <span className="text-neutralx-600"> ({r.opmerking})</span>}
                              {af && <span className="sr-only"> ({r.fase === "klaar" ? "klaar" : "geserveerd"})</span>}
                            </li>
                          );
                        })}
                      </ul>
                      {b.opmerking && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-sm text-ink">{b.opmerking}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {volgende && (
                          <button type="button" className="btn-primary" onClick={() => void zet(b, volgende)}>
                            {VOLGENDE_KNOP[b.status]}
                            <span className="sr-only"> (bestelling {b.nummer})</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            if (window.confirm(`Bestelling ${b.nummer} annuleren?`)) void zet(b, "GEANNULEERD");
                          }}
                        >
                          Annuleren<span className="sr-only"> (bestelling {b.nummer})</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {afgerond.length > 0 && (
        <section className="card p-5" aria-labelledby="afgerond-kop">
          <h2 id="afgerond-kop" className="font-display text-lg font-bold text-ink">
            Afgerond (laatste 12 uur)
          </h2>
          <ul className="mt-2 divide-y divide-hair text-sm">
            {afgerond.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  #{b.nummer} · {b.tafelNaam ?? "Zonder tafel"} · {STATUS_LABEL[b.status]}
                </span>
                <span className="text-neutralx-600">{euro(b.totaalCent)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function NieuweBestelling({ data, doe, klaar }: { data: BeheerData; doe: Doe; klaar: () => void }) {
  const [tafelId, setTafelId] = useState(data.tafels.find((t) => t.actief)?.id ?? "");
  const [aantallen, setAantallen] = useState<Record<string, string>>({});
  const [opmerking, setOpmerking] = useState("");
  const beschikbaar = data.items.filter((i) => i.beschikbaar);

  async function plaats(e: FormEvent) {
    e.preventDefault();
    const mand = Object.entries(aantallen)
      .map(([itemId, a]) => ({ itemId, aantal: Number(a) }))
      .filter((m) => Number.isInteger(m.aantal) && m.aantal > 0);
    if (await doe({ actie: "bestelling", tafelId: tafelId || null, mand, opmerking, naam: "" }, "De bestelling is doorgegeven.")) klaar();
  }

  return (
    <form onSubmit={(e) => void plaats(e)} className="card space-y-4 p-5" aria-labelledby="nieuwe-bestelling-kop">
      <h2 id="nieuwe-bestelling-kop" className="font-display text-lg font-bold text-ink">
        Bestelling invoeren
      </h2>
      <Veld label="Tafel">
        <select className="field-input" value={tafelId} onChange={(e) => setTafelId(e.target.value)}>
          <option value="">Zonder tafel (afhalen, bar)</option>
          {data.tafels
            .filter((t) => t.actief)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.naam}
              </option>
            ))}
        </select>
      </Veld>
      <fieldset>
        <legend className="field-label">Wat wordt er besteld?</legend>
        <ul className="mt-1 grid gap-2 sm:grid-cols-2">
          {beschikbaar.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-hair px-3 py-2">
              <label htmlFor={`aantal-${i.id}`} className="text-sm text-ink">
                {i.naam} <span className="text-neutralx-500">· {euro(i.prijsCent)}</span>
              </label>
              <input id={`aantal-${i.id}`} className="field-input w-20" type="number" min={0} max={50} inputMode="numeric" value={aantallen[i.id] ?? ""} onChange={(e) => setAantallen((a) => ({ ...a, [i.id]: e.target.value }))} placeholder="0" />
            </li>
          ))}
        </ul>
      </fieldset>
      <Veld label="Opmerking voor keuken of bar (mag leeg)">
        <input className="field-input" value={opmerking} onChange={(e) => setOpmerking(e.target.value)} maxLength={300} />
      </Veld>
      <button type="submit" className="btn-primary">
        Doorgeven
      </button>
    </form>
  );
}
