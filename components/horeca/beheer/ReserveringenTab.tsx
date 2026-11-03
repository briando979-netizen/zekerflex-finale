"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { plusDagen } from "@/lib/horeca/reserveren";
import type { BeheerData, Doe } from "@/components/horeca/beheer/types";

// Het reserveringsboek: per dag wie er komt, met status (aangekomen, niet
// gekomen, geannuleerd) en tafel. De bediening boekt zelf in (telefoon); de
// instellingen bepalen wat gasten online kunnen kiezen.

const API = "/api/horeca/beheer";
type Status = "BEVESTIGD" | "AANGEKOMEN" | "NIET_GEKOMEN" | "GEANNULEERD";
interface Reservering {
  id: string;
  tijd: string;
  personen: number;
  naam: string;
  email: string;
  telefoon: string;
  opmerking: string;
  status: Status;
  bron: string;
  tafelId: string | null;
  tafelNaam: string | null;
}
const LABEL: Record<Status, string> = { BEVESTIGD: "Bevestigd", AANGEKOMEN: "Aangekomen", NIET_GEKOMEN: "Niet gekomen", GEANNULEERD: "Geannuleerd" };
const PIL: Record<Status, string> = { BEVESTIGD: "pill-neutral", AANGEKOMEN: "pill-ok", NIET_GEKOMEN: "pill-crit", GEANNULEERD: "pill-warn" };

const vandaagNL = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
const dagTekst = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export function ReserveringenTab({ data, doe }: { data: BeheerData; doe: Doe }) {
  const [datum, setDatum] = useState(vandaagNL);
  const [lijst, setLijst] = useState<Reservering[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nieuw, setNieuw] = useState(false);

  const laad = useCallback(async (d: string) => {
    try {
      setLijst((await stuur<{ reserveringen: Reservering[] }>(`${API}?alleen=reserveringen&datum=${d}`)).reserveringen);
    } catch (e) {
      setFout(foutVan(e));
    }
  }, []);
  useEffect(() => {
    void laad(datum);
  }, [datum, laad]);

  async function actie(body: Record<string, unknown>, okTekst: string) {
    setFout(null);
    setOk(null);
    try {
      await stuur(API, "POST", body);
      setOk(okTekst);
      await laad(datum);
    } catch (e) {
      setFout(foutVan(e));
    }
  }

  const actief = (lijst ?? []).filter((r) => r.status !== "GEANNULEERD");
  const gasten = actief.reduce((s, r) => s + r.personen, 0);

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-lg font-bold capitalize text-ink">{dagTekst(datum)}</h2>
          <p className="text-sm text-neutralx-600">
            {actief.length} {actief.length === 1 ? "reservering" : "reserveringen"} · {gasten} gasten verwacht
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => setDatum(plusDagen(datum, -1))} aria-label="Vorige dag">
            ‹ Vorige
          </button>
          <button type="button" className="btn-ghost" onClick={() => setDatum(vandaagNL())}>
            Vandaag
          </button>
          <button type="button" className="btn-ghost" onClick={() => setDatum(plusDagen(datum, 1))} aria-label="Volgende dag">
            Volgende ›
          </button>
          <input type="date" className="field-input w-auto" aria-label="Kies een dag" value={datum} onChange={(e) => e.target.value && setDatum(e.target.value)} />
          <button type="button" className="btn-primary" onClick={() => setNieuw((v) => !v)} aria-expanded={nieuw}>
            {nieuw ? "Sluiten" : "+ Reservering"}
          </button>
        </div>
      </section>
      <Melding fout={fout} ok={ok} />
      {nieuw && (
        <NieuweReservering
          datum={datum}
          bewaar={async (r) => {
            await actie({ actie: "reservering", ...r }, `Reservering voor ${r.naam} om ${r.tijd} staat erin.`);
            setNieuw(false);
          }}
        />
      )}

      {lijst && lijst.length === 0 && <p className="card p-5 text-sm text-neutralx-600">Geen reserveringen op deze dag.</p>}
      {lijst && lijst.length > 0 && (
        <ul className="card divide-y divide-hair">
          {lijst.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-start justify-between gap-3 p-4 ${r.status === "GEANNULEERD" ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  <span className="font-display text-lg">{r.tijd}</span> · {r.personen} {r.personen === 1 ? "persoon" : "personen"} · {r.naam}
                  <span className={`${PIL[r.status]} ml-2`}>{LABEL[r.status]}</span>
                  {r.bron === "bediening" && <span className="pill-neutral ml-2">ingeboekt</span>}
                </p>
                <p className="text-sm text-neutralx-600">
                  {r.telefoon && (
                    <a href={`tel:${r.telefoon.replace(/[^0-9+]/g, "")}`} className="font-medium text-brand-600 hover:underline">
                      {r.telefoon}
                    </a>
                  )}
                  {r.telefoon && r.email && " · "}
                  {r.email}
                </p>
                {r.opmerking && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm text-ink">{r.opmerking}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {data.tafels.length > 0 && (
                  <select
                    className="field-input w-auto py-1.5 text-sm"
                    aria-label={`Tafel voor ${r.naam} om ${r.tijd}`}
                    value={r.tafelId ?? ""}
                    onChange={(e) => void actie({ actie: "reservering-tafel", id: r.id, tafelId: e.target.value || null }, `Tafel voor ${r.naam} bewaard.`)}
                  >
                    <option value="">Geen tafel</option>
                    {data.tafels.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.naam} ({t.plaatsen})
                      </option>
                    ))}
                  </select>
                )}
                {r.status === "BEVESTIGD" && (
                  <>
                    <button type="button" className="btn-primary" onClick={() => void actie({ actie: "reservering-status", id: r.id, status: "AANGEKOMEN" }, `${r.naam} is binnen.`)}>
                      Aangekomen<span className="sr-only">: {r.naam}</span>
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => void actie({ actie: "reservering-status", id: r.id, status: "NIET_GEKOMEN" }, `${r.naam} staat op niet gekomen.`)}>
                      Niet gekomen<span className="sr-only">: {r.naam}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-crit"
                      onClick={() => {
                        if (window.confirm(`Reservering van ${r.naam} om ${r.tijd} annuleren?`)) void actie({ actie: "reservering-status", id: r.id, status: "GEANNULEERD" }, `De reservering van ${r.naam} is geannuleerd.`);
                      }}
                    >
                      Annuleren<span className="sr-only">: {r.naam}</span>
                    </button>
                  </>
                )}
                {r.status !== "BEVESTIGD" && (
                  <button type="button" className="btn-ghost" onClick={() => void actie({ actie: "reservering-status", id: r.id, status: "BEVESTIGD" }, `${r.naam} staat weer op bevestigd.`)}>
                    Ongedaan maken<span className="sr-only">: {r.naam}</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Instellingen data={data} doe={doe} />
    </div>
  );
}

function NieuweReservering({ datum, bewaar }: { datum: string; bewaar: (r: { datum: string; tijd: string; personen: number; naam: string; email: string; telefoon: string; opmerking: string }) => Promise<void> }) {
  const [v, setV] = useState({ datum, tijd: "19:00", personen: "2", naam: "", email: "", telefoon: "", opmerking: "" });
  const zet = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="card grid gap-4 p-5 sm:grid-cols-4"
      aria-label="Reservering inboeken"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void bewaar({ ...v, personen: Number(v.personen) || 1 });
      }}
    >
      <Veld label="Datum">
        <input className="field-input" type="date" value={v.datum} onChange={zet("datum")} required />
      </Veld>
      <Veld label="Tijd">
        <input className="field-input" type="time" step={900} value={v.tijd} onChange={zet("tijd")} required />
      </Veld>
      <Veld label="Personen">
        <input className="field-input" type="number" min={1} max={500} value={v.personen} onChange={zet("personen")} required />
      </Veld>
      <Veld label="Naam">
        <input className="field-input" value={v.naam} onChange={zet("naam")} required minLength={2} maxLength={80} />
      </Veld>
      <Veld label="Telefoon">
        <input className="field-input" type="tel" value={v.telefoon} onChange={zet("telefoon")} maxLength={40} />
      </Veld>
      <Veld label="E-mail (mag leeg)">
        <input className="field-input" type="email" value={v.email} onChange={zet("email")} maxLength={200} />
      </Veld>
      <div className="sm:col-span-2">
        <Veld label="Opmerking (mag leeg)">
          <input className="field-input" value={v.opmerking} onChange={zet("opmerking")} maxLength={500} placeholder="Bijvoorbeeld: verjaardag, kinderstoel" />
        </Veld>
      </div>
      <div className="sm:col-span-4">
        <button type="submit" className="btn-primary">
          Inboeken
        </button>
        <span className="ml-3 text-xs text-neutralx-500">Inboeken door de bediening mag ook buiten de online grenzen.</span>
      </div>
    </form>
  );
}

function Instellingen({ data, doe }: { data: BeheerData; doe: Doe }) {
  const r = data.reserveren;
  const [v, setV] = useState({ slotMinuten: String(r.slotMinuten), verblijfMinuten: String(r.verblijfMinuten), maxGroep: String(r.maxGroep), dagenVooruit: String(r.dagenVooruit), maxGasten: String(r.maxGasten) });
  const zet = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const plaatsen = data.tafels.filter((t) => t.actief).reduce((s, t) => s + t.plaatsen, 0);
  return (
    <form
      className="card grid gap-4 p-5 sm:grid-cols-5"
      aria-labelledby="reserveer-inst-kop"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void doe(
          { actie: "reserveer-instellingen", slotMinuten: Number(v.slotMinuten), verblijfMinuten: Number(v.verblijfMinuten), maxGroep: Number(v.maxGroep), dagenVooruit: Number(v.dagenVooruit), maxGasten: Number(v.maxGasten) },
          "De instellingen voor reserveren zijn bewaard.",
        );
      }}
    >
      <h2 id="reserveer-inst-kop" className="font-display text-lg font-bold text-ink sm:col-span-5">
        Online reserveren
      </h2>
      <Veld label="Elke … minuten">
        <select className="field-input" value={v.slotMinuten} onChange={zet("slotMinuten")}>
          <option value="15">15</option>
          <option value="30">30</option>
          <option value="60">60</option>
        </select>
      </Veld>
      <Veld label="Tafel bezet (minuten)">
        <input className="field-input" type="number" min={30} max={360} step={15} value={v.verblijfMinuten} onChange={zet("verblijfMinuten")} required />
      </Veld>
      <Veld label="Grootste groep online">
        <input className="field-input" type="number" min={1} max={100} value={v.maxGroep} onChange={zet("maxGroep")} required />
      </Veld>
      <Veld label="Dagen vooruit">
        <input className="field-input" type="number" min={1} max={365} value={v.dagenVooruit} onChange={zet("dagenVooruit")} required />
      </Veld>
      <Veld label="Gasten tegelijk" uitleg={`0 = de plaatsen van je tafels (nu ${plaatsen || "geen tafels"}).`}>
        <input className="field-input" type="number" min={0} max={2000} value={v.maxGasten} onChange={zet("maxGasten")} required />
      </Veld>
      <div className="sm:col-span-5">
        <button type="submit" className="btn-primary">
          Bewaren
        </button>
      </div>
    </form>
  );
}
