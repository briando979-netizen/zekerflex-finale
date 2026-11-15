"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { STATUS_LABEL, VOLGENDE, VOLGENDE_KNOP, isOpen, regelsVoor, type BestelRegel, type BestelStatus } from "@/lib/horeca/bestellen";
import { belbaar, FASE_LABEL, kmTekst, leverFase, schuif, teBetalenCent, tijdTekst, vroegsteOp, type BezorgInstellingen } from "@/lib/horeca/bezorgen";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { useT } from "@/components/i18n/I18nProvider";
import { Bord } from "@/components/horeca/beheer/Bord";
import { BestelKaart } from "@/components/horeca/beheer/BestelKaart";
import { euro } from "@/lib/horeca/weergave";
import type { BeheerData, Doe } from "@/components/horeca/beheer/types";

// Het keuken- en barscherm: open bestellingen per status, met per station
// alleen de eigen regels, ververst elke 8 seconden. De bediening voert hier
// ook zelf een bestelling in (telefoon, aan de bar), ook om af te halen of te
// bezorgen (module bezorgen): dan met tijd, klant, adres en bezorger.

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
  // afhalen en bezorgen
  soort: string;
  naam: string;
  telefoon: string;
  adres: string;
  postcode: string;
  plaats: string;
  afstandM: number | null;
  lat: number | null;
  lng: number | null;
  gewenstOp: string | null;
  bevestigdOp: string | null;
  bezorgerId: string | null;
  onderwegOp: string | null;
  afgeleverdOp: string | null;
  kortingCent: number;
  bezorgkostenCent: number;
  betaald: boolean;
}

const isLevering = (b: Bestelling) => b.soort === "afhalen" || b.soort === "bezorgen";

const KOLOMMEN: BestelStatus[] = ["NIEUW", "IN_BEREIDING", "KLAAR"];
const minutenGeleden = (iso: string, nu: number) => Math.max(0, Math.round((nu - Date.parse(iso)) / 60000));

export function BestellingenTab({ data, doe }: { data: BeheerData; doe: Doe }) {
  const [lijst, setLijst] = useState<Bestelling[] | null>(null);
  const [station, setStation] = useState<Station>("alles");
  const [fout, setFout] = useState<string | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  const [nieuw, setNieuw] = useState(false);
  // bord (tegels per Nieuw/Bezig/Klaar), keuken (kolommen per status, per station) of kaart (bezorgingen)
  const [weergave, setWeergave] = useState<"bord" | "keuken" | "kaart">("bord");
  const [gekozen, setGekozen] = useState<string | null>(null);
  const tb = useT().horecaBord;

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

  // afhalen en bezorgen: de server geeft de bijgewerkte lijst terug (die nemen we over, niet één veld lokaal)
  async function lever(actie: Record<string, unknown>): Promise<boolean> {
    try {
      setLijst((await stuur<{ bestellingen: Bestelling[] }>(API, "POST", actie)).bestellingen);
      setFout(null);
      return true;
    } catch (e) {
      setFout(foutVan(e));
      return false;
    }
  }

  const zichtbaar = (lijst ?? []).filter((b) => regelsVoor(b.regels, station).length > 0);
  const afgerond = zichtbaar.filter((b) => !isOpen(b.status)).reverse().slice(0, 20);
  const gekozenB = gekozen ? (lijst ?? []).find((b) => b.id === gekozen) : undefined;
  const knopStijl = (aan: boolean) => `rounded-full px-4 py-2 text-sm font-semibold ${aan ? "bg-ink text-white" : "bg-white text-neutralx-600 ring-1 ring-hair"}`;
  const kies = (id: string | null) => {
    setGekozen(id);
    if (id && weergave === "kaart") setWeergave("bord");
  };

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex flex-wrap gap-3">
          <div role="group" aria-label={tb.weergave} className="flex gap-1">
            {(["bord", "keuken", "kaart"] as const).map((w) => (
              <button key={w} type="button" aria-pressed={weergave === w} onClick={() => setWeergave(w)} className={knopStijl(weergave === w)}>
                {tb[w]}
              </button>
            ))}
          </div>
          {weergave === "keuken" && (
            <div role="group" aria-label="Scherm voor" className="flex gap-1">
              {(["alles", "keuken", "bar"] as Station[]).map((s) => (
                <button key={s} type="button" aria-pressed={station === s} onClick={() => setStation(s)} className={knopStijl(station === s)}>
                  {s === "alles" ? "Alles" : s === "keuken" ? "Keuken" : "Bar"}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="btn-primary" onClick={() => setNieuw((v) => !v)} aria-expanded={nieuw}>
          {nieuw ? "Sluiten" : "+ Bestelling invoeren"}
        </button>
      </section>
      <Melding fout={fout} />
      {nieuw && <NieuweBestelling data={data} doe={doe} klaar={() => (setNieuw(false), void laad())} />}
      {lijst === null && <p className="text-sm text-neutralx-500">Laden…</p>}

      {weergave === "bord" && lijst && (
        <Bord
          lijst={lijst}
          nu={nu}
          gekozen={gekozenB ? gekozenB.id : null}
          kies={kies}
          detail={gekozenB ? <BonKaart b={gekozenB} station="alles" nu={nu} inst={data.bezorgen} zet={zet} lever={lever} /> : null}
        />
      )}
      {weergave === "kaart" && lijst && <BestelKaart lijst={lijst} zaak={data.bezorgen.plek} nu={nu} kies={kies} />}

      {weergave === "keuken" && (
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
                {kolom.map((b) => (
                  <li key={b.id}>
                    <BonKaart b={b} station={station} nu={nu} inst={data.bezorgen} zet={zet} lever={lever} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      )}

      {weergave === "keuken" && afgerond.length > 0 && (
        <section className="card p-5" aria-labelledby="afgerond-kop">
          <h2 id="afgerond-kop" className="font-display text-lg font-bold text-ink">
            Afgerond (laatste 12 uur)
          </h2>
          <ul className="mt-2 divide-y divide-hair text-sm">
            {afgerond.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  #{b.nummer} · {isLevering(b) ? `${b.soort === "bezorgen" ? "Bezorgd" : "Afgehaald"} · ${b.naam}` : (b.tafelNaam ?? "Zonder tafel")} ·{" "}
                  {isLevering(b) ? FASE_LABEL[leverFase(b)] : STATUS_LABEL[b.status]}
                </span>
                <span className="text-neutralx-600">{euro(isLevering(b) ? teBetalenCent(b) : b.totaalCent)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Eén bestelling met de regels en alle knoppen; in de keukenkolommen en als detail onder het bord. */
function BonKaart({ b, station, nu, inst, zet, lever }: { b: Bestelling; station: Station; nu: number; inst: BezorgInstellingen; zet: (b: Bestelling, s: BestelStatus) => Promise<void>; lever: Lever }) {
  const volgende = VOLGENDE[b.status];
  const min = minutenGeleden(b.createdAt, nu);
  return (
                    <div className={`card p-4 ${min >= 20 && b.status !== "KLAAR" && isOpen(b.status) ? "ring-2 ring-amber-400" : ""}`}>
                      <p className="flex items-baseline justify-between gap-2">
                        <span className="font-display text-xl font-bold text-ink">#{b.nummer}</span>
                        <span className="text-sm text-neutralx-600">
                          {isLevering(b) ? (b.soort === "bezorgen" ? "Bezorgen" : "Afhalen") : (b.tafelNaam ?? "Zonder tafel")} · {min === 0 ? "net" : `${min} min`}
                        </span>
                      </p>
                      {isLevering(b) && <LeverKop b={b} />}
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
                              {r.keuze && <span className="font-semibold"> · {r.keuze}</span>}
                              {r.opmerking && <span className="text-neutralx-600"> ({r.opmerking})</span>}
                              {af && <span className="sr-only"> ({r.fase === "klaar" ? "klaar" : "geserveerd"})</span>}
                            </li>
                          );
                        })}
                      </ul>
                      {b.opmerking && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-sm text-ink">{b.opmerking}</p>}
                      {isLevering(b) && <LeverKnoppen b={b} inst={inst} lever={lever} />}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {/* afhalen en bezorgen eindigen met Opgehaald of Afgeleverd (met betaalwijze), niet met Serveren */}
                        {volgende && !(isLevering(b) && volgende === "GESERVEERD") && (
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
                    </div>
  );
}

/** Tijd, klant, adres en bedrag van een afhaal- of bezorgbestelling. */
function LeverKop({ b }: { b: Bestelling }) {
  const tijd = b.bevestigdOp ?? b.gewenstOp;
  const tel = belbaar(b.telefoon);
  return (
    <div className="mt-2 space-y-1 text-sm text-ink">
      <p className="flex flex-wrap items-center gap-2">
        <span className={`rounded-lg px-2 py-0.5 font-display text-lg font-bold ${b.bevestigdOp ? "bg-ink text-white" : "bg-amber-50 text-ink ring-1 ring-amber-400"}`}>{tijdTekst(tijd)}</span>
        <span className="text-neutralx-600">{b.bevestigdOp ? (b.soort === "bezorgen" ? "bezorgen om" : "klaar om") : "gevraagd, nog bevestigen"}</span>
        <span className="font-semibold">{FASE_LABEL[leverFase(b)]}</span>
      </p>
      <p>
        <strong>{b.naam}</strong>
        {tel && (
          <>
            {" · "}
            <a className="font-semibold text-ink underline" href={`tel:${tel}`}>
              {b.telefoon}
            </a>
          </>
        )}
      </p>
      {b.soort === "bezorgen" && (
        <p>
          {b.adres}, {b.postcode} {b.plaats}
          {typeof b.afstandM === "number" && <span className="text-neutralx-600"> · {kmTekst(b.afstandM)}</span>}
        </p>
      )}
      <p className="text-neutralx-600">
        {euro(teBetalenCent(b))}
        {b.bezorgkostenCent > 0 && ` (met ${euro(b.bezorgkostenCent)} bezorgkosten)`}
        {b.betaald ? " · betaald" : " · nog te betalen"}
      </p>
    </div>
  );
}

/** Tijd bevestigen of verzetten, een bezorger kiezen, onderweg en afgeleverd/opgehaald. */
type Lever = (actie: Record<string, unknown>) => Promise<boolean>;

function LeverKnoppen({ b, inst, lever }: { b: Bestelling; inst: BezorgInstellingen; lever: Lever }) {
  const fase = leverFase(b);
  if (fase === "afgeleverd" || fase === "geannuleerd") return null;
  const bezorgers = inst.bezorgers.filter((x) => x.actief || x.id === b.bezorgerId);
  const af = b.soort === "bezorgen" ? "Afgeleverd" : "Opgehaald";
  return (
    <div className="mt-3 space-y-2 border-t border-hair pt-3">
      <TijdBevestigen b={b} inst={inst} lever={lever} />
      {b.soort === "bezorgen" && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span>Bezorger</span>
          <select className="field-input w-auto" value={b.bezorgerId ?? ""} onChange={(e) => void lever({ actie: "levering-bezorger", id: b.id, bezorgerId: e.target.value || null })}>
            <option value="">Nog niemand</option>
            {bezorgers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.naam}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {b.soort === "bezorgen" && b.bevestigdOp && !b.onderwegOp && (
          <button type="button" className="btn-primary" onClick={() => void lever({ actie: "levering-onderweg", id: b.id })}>
            Onderweg<span className="sr-only"> (bestelling {b.nummer})</span>
          </button>
        )}
        {b.onderwegOp && (
          <button type="button" className="btn-ghost" onClick={() => void lever({ actie: "levering-onderweg", id: b.id, terug: true })}>
            Toch niet onderweg<span className="sr-only"> (bestelling {b.nummer})</span>
          </button>
        )}
        {b.bevestigdOp &&
          (b.betaald ? (
            <button type="button" className="btn-primary" onClick={() => void lever({ actie: "levering-af", id: b.id, betaalwijze: "al-betaald" })}>
              {af}
              <span className="sr-only"> (bestelling {b.nummer})</span>
            </button>
          ) : (
            (["pin", "contant", "al-betaald"] as const).map((w) => (
              <button key={w} type="button" className={w === "pin" ? "btn-primary" : "btn-ghost"} onClick={() => void lever({ actie: "levering-af", id: b.id, betaalwijze: w })}>
                {af}, {w === "pin" ? "pin" : w === "contant" ? "contant" : "al betaald"}
                <span className="sr-only"> (bestelling {b.nummer})</span>
              </button>
            ))
          ))}
      </div>
    </div>
  );
}

/** De gevraagde (of vroegst mogelijke) tijd met − en +, en bevestigen. Ook om een bevestigde tijd te verzetten. */
function TijdBevestigen({ b, inst, lever }: { b: Bestelling; inst: BezorgInstellingen; lever: Lever }) {
  const soort = b.soort === "bezorgen" ? "bezorgen" : "afhalen";
  const start = b.bevestigdOp ?? b.gewenstOp ?? vroegsteOp(new Date(), soort, inst).toISOString();
  const [op, setOp] = useState(() => new Date(start));
  const [open, setOpen] = useState(!b.bevestigdOp);
  if (!open) {
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        Tijd verzetten<span className="sr-only"> (bestelling {b.nummer})</span>
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Tijd voor bestelling ${b.nummer}`}>
      <button type="button" className="btn-ghost" onClick={() => setOp((d) => schuif(d, -5))} aria-label="5 minuten eerder">
        −
      </button>
      <span className="min-w-[4.5rem] text-center font-display text-2xl font-bold text-ink" aria-live="polite">
        {amsterdamClock(op)}
      </span>
      <button type="button" className="btn-ghost" onClick={() => setOp((d) => schuif(d, 5))} aria-label="5 minuten later">
        +
      </button>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          void lever({ actie: "levering-tijd", id: b.id, tijd: amsterdamClock(op) }).then((ok) => {
            if (ok) setOpen(false);
          });
        }}
      >
        {b.bevestigdOp ? "Nieuwe tijd bewaren" : "Tijd bevestigen"}
      </button>
    </div>
  );
}

type Soort = "tafel" | "afhalen" | "bezorgen";

function NieuweBestelling({ data, doe, klaar }: { data: BeheerData; doe: Doe; klaar: () => void }) {
  const [soort, setSoort] = useState<Soort>("tafel");
  const [tafelId, setTafelId] = useState(data.tafels.find((t) => t.actief)?.id ?? "");
  const [aantallen, setAantallen] = useState<Record<string, string>>({});
  const [opmerking, setOpmerking] = useState("");
  const [klant, setKlant] = useState({ naam: "", telefoon: "", adres: "", postcode: "", plaats: "" });
  const [zsm, setZsm] = useState(true);
  const [tijd, setTijd] = useState("");
  const beschikbaar = data.items.filter((i) => i.beschikbaar);
  const leveren = data.zaak.modules.includes("bezorgen");
  const soorten: { id: Soort; label: string }[] = [
    { id: "tafel", label: "In de zaak" },
    ...(leveren && data.bezorgen.afhalen ? [{ id: "afhalen" as const, label: "Afhalen" }] : []),
    ...(leveren && data.bezorgen.bezorgen ? [{ id: "bezorgen" as const, label: "Bezorgen" }] : []),
  ];
  const zetKlant = (veld: keyof typeof klant, waarde: string) => setKlant((k) => ({ ...k, [veld]: waarde }));

  async function plaats(e: FormEvent) {
    e.preventDefault();
    const mand = Object.entries(aantallen)
      .map(([itemId, a]) => ({ itemId, aantal: Number(a) }))
      .filter((m) => Number.isInteger(m.aantal) && m.aantal > 0);
    const gelukt =
      soort === "tafel"
        ? await doe({ actie: "bestelling", tafelId: tafelId || null, mand, opmerking, naam: "" }, "De bestelling is doorgegeven.")
        : await doe({ actie: "levering", soort, mand, opmerking, ...klant, email: "", tijd: zsm || !tijd ? "zsm" : tijd }, soort === "bezorgen" ? "De bezorging is doorgegeven." : "De afhaalbestelling is doorgegeven.");
    if (gelukt) klaar();
  }

  return (
    <form onSubmit={(e) => void plaats(e)} className="card space-y-4 p-5" aria-labelledby="nieuwe-bestelling-kop">
      <h2 id="nieuwe-bestelling-kop" className="font-display text-lg font-bold text-ink">
        Bestelling invoeren
      </h2>
      {soorten.length > 1 && (
        <fieldset>
          <legend className="field-label">Waar is de bestelling voor?</legend>
          <div className="mt-1 flex flex-wrap gap-1">
            {soorten.map((s) => (
              <label key={s.id} className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold ${soort === s.id ? "bg-ink text-white" : "bg-white text-neutralx-600 ring-1 ring-hair"}`}>
                <input type="radio" name="soort" value={s.id} checked={soort === s.id} onChange={() => setSoort(s.id)} className="sr-only" />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {soort === "tafel" ? (
        <Veld label="Tafel">
          <select className="field-input" value={tafelId} onChange={(e) => setTafelId(e.target.value)}>
            <option value="">Zonder tafel (bar, balie)</option>
            {data.tafels
              .filter((t) => t.actief)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.naam}
                </option>
              ))}
          </select>
        </Veld>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Veld label="Naam klant">
            <input className="field-input" value={klant.naam} onChange={(e) => zetKlant("naam", e.target.value)} maxLength={60} required autoComplete="off" />
          </Veld>
          <Veld label="Telefoon">
            <input className="field-input" type="tel" value={klant.telefoon} onChange={(e) => zetKlant("telefoon", e.target.value)} maxLength={20} required autoComplete="off" />
          </Veld>
          {soort === "bezorgen" && (
            <>
              <Veld label="Straat en huisnummer">
                <input className="field-input" value={klant.adres} onChange={(e) => zetKlant("adres", e.target.value)} maxLength={120} required autoComplete="off" />
              </Veld>
              <Veld label="Postcode">
                <input className="field-input" value={klant.postcode} onChange={(e) => zetKlant("postcode", e.target.value)} maxLength={8} required autoComplete="off" />
              </Veld>
              <Veld label="Plaats">
                <input className="field-input" value={klant.plaats} onChange={(e) => zetKlant("plaats", e.target.value)} maxLength={60} required autoComplete="off" />
              </Veld>
            </>
          )}
          <fieldset className="sm:col-span-2">
            <legend className="field-label">{soort === "bezorgen" ? "Wanneer bezorgen?" : "Wanneer ophalen?"}</legend>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink">
              <label className="flex items-center gap-2">
                <input type="radio" name="wanneer" checked={zsm} onChange={() => setZsm(true)} /> Zo snel mogelijk
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="wanneer" checked={!zsm} onChange={() => setZsm(false)} /> Om
              </label>
              <input className="field-input w-32" type="time" step={300} value={tijd} onChange={(e) => (setTijd(e.target.value), setZsm(false))} aria-label="Tijd" />
            </div>
          </fieldset>
        </div>
      )}
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
