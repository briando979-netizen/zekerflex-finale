"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BeheerWeergave, LesRij } from "@/lib/rijschool/weergave";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";
import { foutVan, stuur } from "@/components/rijschool/api";
import { LesStatus, Melding, Schakelaar, Veld } from "@/components/rijschool/ui";
import { datumLang, metHoofdletter, SOORT_LABEL, tijd } from "@/lib/rijschool/format";
import { maandagVan, plusDagen } from "@/lib/rijschool/planning";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { lesduur } from "@/lib/rijschool/tegoed";

// De agenda van de rijschool: per week alle lessen, inplannen en verzetten,
// en na afloop afvinken (gereden / niet verschenen / geannuleerd).

export interface LesConcept {
  id: string | null;
  leerlingId: string | null;
  instructeurId: string;
  voertuigId: string | null;
  soort: "LES" | "PROEFLES" | "TOETS" | "EXAMEN";
  datum: string;
  tijd: string;
  duurMin: number;
  ophaaladres: string;
  mail: boolean;
}

export function nieuwConcept(data: BeheerWeergave, datum: string, leerlingId: string | null = null): LesConcept {
  const leerling = leerlingId ? data.leerlingen.find((l) => l.id === leerlingId) : undefined;
  return {
    id: null,
    leerlingId,
    instructeurId: leerling?.instructeurId ?? data.instructeurs.find((i) => i.actief)?.id ?? "",
    voertuigId: data.voertuigen.find((v) => v.actief && v.automaat === (leerling?.automaat ?? false))?.id ?? data.voertuigen.find((v) => v.actief)?.id ?? null,
    soort: "LES",
    datum,
    tijd: "09:00",
    duurMin: data.rijschool.lesMinuten,
    ophaaladres: leerling?.adres ?? "",
    mail: true,
  };
}

export function AgendaTab({ data, doe }: { data: BeheerWeergave; doe: Doe }) {
  const vandaag = amsterdamDayKey(new Date());
  const [week, setWeek] = useState(maandagVan(vandaag));
  const [lessen, setLessen] = useState<LesRij[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [concept, setConcept] = useState<LesConcept | null>(null);

  const laad = useCallback(async () => {
    try {
      setLessen((await stuur<{ lessen: LesRij[] }>(`/api/rijschool/beheer?van=${week}&dagen=7`)).lessen);
      setFout(null);
    } catch (e) {
      setFout(foutVan(e));
    }
  }, [week]);

  useEffect(() => {
    void laad();
  }, [laad]);

  const perDag = useMemo(() => {
    const dagen = Array.from({ length: 7 }, (_, i) => plusDagen(week, i));
    return dagen.map((d) => ({ datum: d, lessen: (lessen ?? []).filter((l) => amsterdamDayKey(l.start) === d) }));
  }, [lessen, week]);

  const kleurVan = (id: string) => data.instructeurs.find((i) => i.id === id)?.kleur ?? "#888";

  async function status(les: LesRij, s: "GEPLAND" | "VOLTOOID" | "GEANNULEERD" | "NIET_VERSCHENEN") {
    if (s === "GEANNULEERD" && !window.confirm("Deze les annuleren? De leerling krijgt een mail.")) return;
    try {
      await doe({ actie: "lesStatus", id: les.id, status: s, mail: s === "GEANNULEERD" });
      await laad();
    } catch (e) {
      setFout(foutVan(e));
    }
  }

  function verzet(les: LesRij) {
    setConcept({
      id: les.id,
      leerlingId: les.leerlingId,
      instructeurId: les.instructeurId,
      voertuigId: les.voertuigId,
      soort: les.soort as LesConcept["soort"],
      datum: amsterdamDayKey(les.start),
      tijd: tijd(les.start),
      duurMin: lesduur(les.start, les.eind),
      ophaaladres: les.ophaaladres,
      mail: true,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost !px-3" onClick={() => setWeek(plusDagen(week, -7))} aria-label="Vorige week">
          ←
        </button>
        <button type="button" className="btn-ghost" onClick={() => setWeek(maandagVan(vandaag))}>
          Deze week
        </button>
        <button type="button" className="btn-ghost !px-3" onClick={() => setWeek(plusDagen(week, 7))} aria-label="Volgende week">
          →
        </button>
        <span className="text-sm font-medium text-ink">
          {datumLang(`${week}T12:00:00Z`)} – {datumLang(`${plusDagen(week, 6)}T12:00:00Z`)}
        </span>
        <button type="button" className="btn-primary ml-auto" onClick={() => setConcept(nieuwConcept(data, week < vandaag ? vandaag : week))} disabled={data.instructeurs.length === 0}>
          Les inplannen
        </button>
      </div>
      <Melding fout={fout} />

      {concept && (
        <LesFormulier
          data={data}
          concept={concept}
          onAnnuleer={() => setConcept(null)}
          onKlaar={async (datum) => {
            setConcept(null);
            setWeek(maandagVan(datum));
            await laad();
          }}
          doe={doe}
        />
      )}

      {lessen === null ? (
        <p className="text-sm text-neutralx-500">Agenda laden…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {perDag.map(({ datum, lessen: dag }) => (
            <section key={datum} className={`card p-4 ${datum === vandaag ? "ring-2 ring-brand-300" : ""}`}>
              <h3 className="font-semibold text-ink">{metHoofdletter(datumLang(`${datum}T12:00:00Z`))}</h3>
              {dag.length === 0 ? (
                <p className="mt-1 text-sm text-neutralx-500">Geen lessen.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {dag.map((les) => (
                    <li key={les.id} className={`rounded-lg border border-hair p-2.5 ${les.status === "GEANNULEERD" ? "opacity-60" : ""}`}>
                      <div className="flex items-start gap-2">
                        <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: kleurVan(les.instructeurId) }} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="num text-sm font-semibold text-ink">
                            {tijd(les.start)} – {tijd(les.eind)} · {SOORT_LABEL[les.soort] ?? les.soort}
                          </p>
                          <p className="truncate text-sm text-neutralx-600">
                            {les.leerlingNaam ?? "Geen leerling"} · {les.instructeurNaam}
                            {les.voertuigNaam ? ` · ${les.voertuigNaam}` : ""}
                          </p>
                        </div>
                        <LesStatus status={les.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {les.status === "GEPLAND" ? (
                          <>
                            <button type="button" className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-ok" onClick={() => status(les, "VOLTOOID")}>
                              Gereden
                            </button>
                            <button type="button" className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-semibold text-ink" onClick={() => verzet(les)}>
                              Verzetten
                            </button>
                            <button type="button" className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-crit" onClick={() => status(les, "NIET_VERSCHENEN")}>
                              Niet verschenen
                            </button>
                            <button type="button" className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-warn" onClick={() => status(les, "GEANNULEERD")}>
                              Annuleren
                            </button>
                          </>
                        ) : (
                          <button type="button" className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-semibold text-ink" onClick={() => status(les, "GEPLAND")}>
                            Terug naar gepland
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
      <p className="text-xs text-neutralx-500">
        Een gereden les of een les waarvoor de leerling niet kwam, gaat van het lestegoed af. Proeflessen en examens betaal je los via een pakket.
      </p>
    </div>
  );
}

export function LesFormulier({
  data,
  concept,
  doe,
  onAnnuleer,
  onKlaar,
}: {
  data: BeheerWeergave;
  concept: LesConcept;
  doe: Doe;
  onAnnuleer: () => void;
  onKlaar: (datum: string) => void | Promise<void>;
}) {
  const [c, setC] = useState(concept);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const actieveLeerlingen = data.leerlingen.filter((l) => l.status !== "GESTOPT" || l.id === c.leerlingId);

  function kiesLeerling(id: string) {
    const l = data.leerlingen.find((x) => x.id === id);
    setC({ ...c, leerlingId: id || null, ...(l ? { ophaaladres: l.adres || c.ophaaladres, instructeurId: l.instructeurId ?? c.instructeurId } : {}) });
  }

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    try {
      await doe({
        actie: "les",
        id: c.id,
        mail: c.mail && c.leerlingId !== null,
        data: {
          instructeurId: c.instructeurId,
          leerlingId: c.leerlingId,
          voertuigId: c.voertuigId,
          soort: c.soort,
          datum: c.datum,
          tijd: c.tijd,
          duurMin: c.duurMin,
          ophaaladres: c.ophaaladres,
        },
      });
      await onKlaar(c.datum);
    } catch (err) {
      setFout(foutVan(err));
    } finally {
      setBezig(false);
    }
  }

  return (
    <form onSubmit={bewaar} className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <h3 className="font-display text-lg font-bold text-ink sm:col-span-2 lg:col-span-4">{c.id ? "Les verzetten" : "Les inplannen"}</h3>
      <Veld label="Leerling">
        <select className="field-input" value={c.leerlingId ?? ""} onChange={(e) => kiesLeerling(e.target.value)}>
          <option value="">Geen leerling (bijvoorbeeld een blok)</option>
          {actieveLeerlingen.map((l) => (
            <option key={l.id} value={l.id}>
              {l.naam}
            </option>
          ))}
        </select>
      </Veld>
      <Veld label="Instructeur">
        <select className="field-input" value={c.instructeurId} onChange={(e) => setC({ ...c, instructeurId: e.target.value })} required>
          {data.instructeurs
            .filter((i) => i.actief || i.id === c.instructeurId)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.naam}
              </option>
            ))}
        </select>
      </Veld>
      <Veld label="Auto">
        <select className="field-input" value={c.voertuigId ?? ""} onChange={(e) => setC({ ...c, voertuigId: e.target.value || null })}>
          <option value="">Geen auto gekozen</option>
          {data.voertuigen
            .filter((v) => v.actief || v.id === c.voertuigId)
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.naam}
                {v.automaat ? " (automaat)" : ""}
              </option>
            ))}
        </select>
      </Veld>
      <Veld label="Soort">
        <select className="field-input" value={c.soort} onChange={(e) => setC({ ...c, soort: e.target.value as LesConcept["soort"] })}>
          {(["LES", "PROEFLES", "TOETS", "EXAMEN"] as const).map((s) => (
            <option key={s} value={s}>
              {SOORT_LABEL[s]}
            </option>
          ))}
        </select>
      </Veld>
      <Veld label="Datum">
        <input className="field-input" type="date" value={c.datum} onChange={(e) => setC({ ...c, datum: e.target.value })} required />
      </Veld>
      <Veld label="Begintijd">
        <input className="field-input" type="time" step={900} value={c.tijd} onChange={(e) => setC({ ...c, tijd: e.target.value })} required />
      </Veld>
      <Veld label="Duur (minuten)">
        <input className="field-input" type="number" min={15} max={300} step={15} value={c.duurMin} onChange={(e) => setC({ ...c, duurMin: Number(e.target.value) })} required />
      </Veld>
      <Veld label="Ophaaladres">
        <input className="field-input" value={c.ophaaladres} onChange={(e) => setC({ ...c, ophaaladres: e.target.value })} maxLength={160} />
      </Veld>
      <div className="sm:col-span-2 lg:col-span-4">
        <Schakelaar label="Stuur de leerling een bevestiging per mail" aan={c.mail} onChange={(mail) => setC({ ...c, mail })} />
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <Melding fout={fout} />
      </div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className="btn-primary" disabled={bezig || !c.instructeurId}>
          {bezig ? "Bezig…" : c.id ? "Verzetten" : "Inplannen"}
        </button>
        <button type="button" className="btn-ghost" onClick={onAnnuleer}>
          Annuleren
        </button>
      </div>
    </form>
  );
}
