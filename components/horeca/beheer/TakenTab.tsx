"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { MOMENTEN, MOMENT_LABEL, alsRegel, waardeOk, type Taak } from "@/lib/horeca/taken";
import { plusDagen } from "@/lib/horeca/reserveren";

// Takenlijsten: per dag (wekelijkse lijsten per week) afvinken, metingen
// vastleggen met een waarschuwing buiten de grens, en de registratie van 90
// dagen downloaden voor een inspectie. Lijsten bewerk je als tekst.

const API = "/api/horeca/beheer";
interface Vinkje {
  taak: number;
  door: string;
  waarde: string;
  op: string;
}
interface Lijst {
  id: string;
  naam: string;
  moment: string;
  periode: string;
  taken: Taak[];
  vinkjes: Vinkje[];
}
const vandaagNL = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
const dagTekst = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const klok = (iso: string) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const grens = (t: Taak) => [t.min !== undefined ? `min ${t.min}` : "", t.max !== undefined ? `max ${t.max}` : ""].filter(Boolean).join(", ");

function leesNaam(): string {
  try {
    return window.localStorage.getItem("zf-horeca-wie") ?? "";
  } catch {
    return "";
  }
}

export function TakenTab() {
  const [datum, setDatum] = useState(vandaagNL);
  const [lijsten, setLijsten] = useState<Lijst[] | null>(null);
  const [wie, setWie] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bewerk, setBewerk] = useState<{ id?: string; naam: string; moment: string; regels: string } | null>(null);
  const [waarden, setWaarden] = useState<Record<string, string>>({});

  useEffect(() => setWie(leesNaam()), []);
  const laad = useCallback(async (d: string) => {
    try {
      setLijsten((await stuur<{ lijsten: Lijst[] }>(`${API}?alleen=taken&datum=${d}`)).lijsten);
    } catch (e) {
      setFout(foutVan(e));
    }
  }, []);
  useEffect(() => {
    void laad(datum);
  }, [datum, laad]);

  async function post(body: Record<string, unknown>, okTekst: string | null) {
    setFout(null);
    setOk(null);
    try {
      const r = await stuur<{ lijsten?: Lijst[]; binnenGrens?: boolean | null }>(API, "POST", body);
      if (r.lijsten) setLijsten(r.lijsten);
      else await laad(datum);
      if (r.binnenGrens === false) setFout("Let op: deze waarde valt buiten de grens. Neem actie (bijvoorbeeld de koeling laten nakijken) en meet opnieuw.");
      else if (okTekst) setOk(okTekst);
      return true;
    } catch (e) {
      setFout(foutVan(e));
      return false;
    }
  }

  const vink = (l: Lijst, i: number, waarde = "") => post({ actie: "afvinken", lijstId: l.id, datum, taak: i, waarde, door: wie }, null);

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-end justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-lg font-bold capitalize text-ink">{dagTekst(datum)}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" aria-label="Vorige dag" onClick={() => setDatum(plusDagen(datum, -1))}>
              ‹ Vorige
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDatum(vandaagNL())}>
              Vandaag
            </button>
            <button type="button" className="btn-ghost" aria-label="Volgende dag" onClick={() => setDatum(plusDagen(datum, 1))}>
              Volgende ›
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Veld label="Wie vinkt af?">
            <input
              className="field-input w-44"
              value={wie}
              maxLength={60}
              placeholder="Je naam"
              onChange={(e) => {
                setWie(e.target.value);
                try {
                  window.localStorage.setItem("zf-horeca-wie", e.target.value);
                } catch {
                  /* geen opslag: dan vult de server je inlognaam in */
                }
              }}
            />
          </Veld>
          <a href={`${API}?alleen=registratie`} className="btn-ghost">
            Registratie (Excel)
          </a>
          <button type="button" className="btn-primary" onClick={() => setBewerk({ naam: "", moment: "dagelijks", regels: "" })}>
            + Lijst
          </button>
        </div>
      </section>
      <Melding fout={fout} ok={ok} />

      {bewerk && (
        <form
          className="card space-y-4 p-5"
          aria-labelledby="lijst-kop"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void post({ actie: "takenlijst", ...bewerk }, `Lijst "${bewerk.naam}" bewaard.`).then((g) => g && setBewerk(null));
          }}
        >
          <h2 id="lijst-kop" className="font-display text-lg font-bold text-ink">
            {bewerk.id ? "Lijst bewerken" : "Nieuwe lijst"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Veld label="Naam">
              <input className="field-input" value={bewerk.naam} onChange={(e) => setBewerk({ ...bewerk, naam: e.target.value })} required maxLength={60} />
            </Veld>
            <Veld label="Wanneer">
              <select className="field-input" value={bewerk.moment} onChange={(e) => setBewerk({ ...bewerk, moment: e.target.value })}>
                {MOMENTEN.map((m) => (
                  <option key={m} value={m}>
                    {MOMENT_LABEL[m]}
                  </option>
                ))}
              </select>
            </Veld>
          </div>
          <Veld label="Taken, één per regel" uitleg="Een meting met grens schrijf je zo: Temperatuur koelcel (max 7) of Vriezer (min -25 max -18).">
            <textarea className="field-input font-mono text-sm" rows={8} value={bewerk.regels} onChange={(e) => setBewerk({ ...bewerk, regels: e.target.value })} required />
          </Veld>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary">
              Bewaren
            </button>
            <button type="button" className="btn-ghost" onClick={() => setBewerk(null)}>
              Annuleren
            </button>
            {bewerk.id && (
              <button
                type="button"
                className="btn-ghost ml-auto text-crit"
                onClick={() => {
                  if (window.confirm(`Lijst "${bewerk.naam}" verwijderen, met alles wat erin is afgevinkt?`)) void post({ actie: "takenlijst-weg", id: bewerk.id }, "Lijst verwijderd.").then((g) => g && setBewerk(null));
                }}
              >
                Lijst verwijderen
              </button>
            )}
          </div>
        </form>
      )}

      {lijsten && lijsten.length === 0 && (
        <section className="card p-5">
          <p className="text-sm text-neutralx-600">Nog geen takenlijsten. Begin met onze voorbeelden (opening, sluiting en wekelijks, met temperaturen) en pas ze aan.</p>
          <button type="button" className="btn-primary mt-3" onClick={() => void post({ actie: "takenlijst-voorbeeld" }, "De voorbeeldlijsten staan klaar.")}>
            Voorbeeldlijsten maken
          </button>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(lijsten ?? []).map((l) => {
          const klaar = l.vinkjes.length;
          return (
            <section key={l.id} className="card p-5" aria-labelledby={`lijst-${l.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 id={`lijst-${l.id}`} className="font-display text-lg font-bold text-ink">
                    {l.naam}
                  </h2>
                  <p className="text-sm text-neutralx-600">
                    {MOMENT_LABEL[l.moment as keyof typeof MOMENT_LABEL] ?? l.moment}
                    {l.moment === "wekelijks" && ` · week van ${dagTekst(l.periode)}`} · {klaar} van {l.taken.length} gedaan
                  </p>
                </div>
                <button type="button" className="btn-ghost" aria-label={`Lijst ${l.naam} bewerken`} onClick={() => setBewerk({ id: l.id, naam: l.naam, moment: l.moment, regels: l.taken.map(alsRegel).join("\n") })}>
                  Bewerken
                </button>
              </div>
              <ul className="mt-3 divide-y divide-hair">
                {l.taken.map((t, i) => {
                  const v = l.vinkjes.find((x) => x.taak === i);
                  const sleutel = `${l.id}-${i}`;
                  if (v) {
                    const binnen = t.meten ? waardeOk(t, v.waarde) : true;
                    return (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="text-sm text-ink">
                          <span aria-hidden className="mr-1 text-ok">
                            ✓
                          </span>
                          {t.tekst}
                          {t.meten && (
                            <strong className={`ml-2 ${binnen === false ? "text-crit" : ""}`}>
                              {v.waarde}
                              {binnen === false && " · buiten de grens"}
                            </strong>
                          )}
                          <span className="ml-2 text-xs text-neutralx-500">
                            {v.door} · {klok(v.op)}
                          </span>
                        </span>
                        <button type="button" className="btn-ghost py-1 text-xs" onClick={() => void post({ actie: "afvinken-weg", lijstId: l.id, datum, taak: i }, null)}>
                          Ongedaan<span className="sr-only">: {t.tekst}</span>
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      {t.meten ? (
                        <>
                          <label htmlFor={sleutel} className="text-sm text-ink">
                            {t.tekst} <span className="text-xs text-neutralx-500">({grens(t)})</span>
                          </label>
                          <span className="flex items-center gap-2">
                            <input
                              id={sleutel}
                              className="field-input w-24 py-1.5"
                              inputMode="decimal"
                              placeholder="°C"
                              value={waarden[sleutel] ?? ""}
                              onChange={(e) => setWaarden((w) => ({ ...w, [sleutel]: e.target.value }))}
                            />
                            <button type="button" className="btn-primary py-1.5" onClick={() => void vink(l, i, waarden[sleutel] ?? "")}>
                              Vastleggen<span className="sr-only">: {t.tekst}</span>
                            </button>
                          </span>
                        </>
                      ) : (
                        <label className="flex cursor-pointer items-center gap-3 text-sm text-ink">
                          <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={false} onChange={() => void vink(l, i)} />
                          {t.tekst}
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
