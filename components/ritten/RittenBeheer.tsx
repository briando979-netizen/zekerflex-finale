"use client";

import { useCallback, useEffect, useState } from "react";
import { amsterdamClock, amsterdamDayKey, amsterdamLocalInput } from "@/lib/time/amsterdam";
import {
  MAX_CHAUFFEURS,
  MAX_TUSSENSTOPS,
  OVERGANGEN,
  STATUSSEN,
  STATUS_NAAM,
  dagNaam,
  formatKenteken,
  groepeerPerDag,
  magVerwijderen,
  plusDagen,
  ritUren,
  urenTekst,
  voertuigNaam,
  weekVan,
  type ApkMelding,
  type Rit,
  type RitStatus,
  type Totalen,
  type Voertuig,
} from "@/lib/ritten/model";

// Het ritten- en voertuigenbeheer van een bedrijf: dag- en weekoverzicht, rit maken en bewerken, snelle statusknoppen,
// voertuigen en chauffeurs. Uren en kilometers zijn handmatig. Alle tijden zijn Nederlandse tijd.

const kaart = "rounded-xl border border-hair bg-white p-4";
const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500";

const STATUS_KLEUR: Record<RitStatus, string> = {
  gepland: "bg-brand-50 text-brand-700",
  onderweg: "bg-brand-50 text-brand-700",
  afgeleverd: "bg-paper-soft text-ink",
  geannuleerd: "bg-paper-soft text-neutralx-600",
};

const KNOP_TEKST = (van: RitStatus, naar: RitStatus): string => {
  if (naar === "onderweg") return van === "afgeleverd" ? "Heropenen" : "Onderweg";
  if (naar === "afgeleverd") return "Afgeleverd";
  if (naar === "geannuleerd") return "Annuleren";
  return "Terug naar gepland";
};

type Fout = { error?: { message?: string } };
type Lijst = { ritten: Rit[]; waarschuwingen: Record<string, string[]>; totalen: Totalen | null; voertuigen: Voertuig[]; chauffeurs: string[]; apk: ApkMelding[]; van: string; tot: string };

async function lees<T>(res: Response): Promise<{ ok: boolean; data: (T & Fout) | null }> {
  return { ok: res.ok, data: (await res.json().catch(() => null)) as (T & Fout) | null };
}

const verstuur = (url: string, method: string, body?: unknown) => fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const kmTekst = (km: number) => `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(km)} km`;
const korteDag = (dag: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${dag}T12:00:00Z`));

function Foutregel({ tekst }: { tekst: string | null }) {
  return tekst ? (
    <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
      {tekst}
    </p>
  ) : null;
}

export function RittenBeheer() {
  const [modus, setModus] = useState<"dag" | "week">("week");
  const [anker, setAnker] = useState(() => amsterdamDayKey(new Date()));
  const [status, setStatus] = useState<RitStatus | "">("");
  const [voertuig, setVoertuig] = useState("");
  const [chauffeur, setChauffeur] = useState("");
  const [lijst, setLijst] = useState<Lijst | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<{ rit: Rit | null } | null>(null);
  const [paneel, setPaneel] = useState<"voertuigen" | "chauffeurs" | null>(null);

  const periode = modus === "dag" ? { van: anker, tot: anker } : weekVan(anker);

  const laad = useCallback(async () => {
    const p = new URLSearchParams({ van: periode.van, tot: periode.tot });
    if (status) p.set("status", status);
    if (voertuig) p.set("voertuig", voertuig);
    if (chauffeur) p.set("chauffeur", chauffeur);
    try {
      const { ok, data } = await lees<Lijst>(await fetch(`/api/werkgever/ritten?${p}`, { cache: "no-store" }));
      if (!ok || !data?.ritten) {
        setFout(data?.error?.message ?? "De ritten konden niet worden geladen. Vernieuw de pagina.");
        return;
      }
      setFout(null);
      setLijst(data);
    } catch {
      setFout("De ritten konden niet worden geladen. Controleer je verbinding.");
    }
  }, [periode.van, periode.tot, status, voertuig, chauffeur]);

  useEffect(() => {
    void laad();
  }, [laad]);

  async function zetStatus(rit: Rit, naar: RitStatus) {
    setFout(null);
    const { ok, data } = await lees<{ rit: Rit }>(await verstuur(`/api/werkgever/ritten/${rit.id}`, "PATCH", { status: naar }));
    if (!ok || !data?.rit) {
      setFout(data?.error?.message ?? "De status kon niet worden gewijzigd.");
      return;
    }
    await laad();
  }

  if (!lijst) return fout ? <Foutregel tekst={fout} /> : <p className="text-sm text-neutralx-500">Laden…</p>;

  if (open) {
    return (
      <RitEditor
        key={open.rit?.id ?? "nieuw"}
        begin={open.rit}
        standaardDag={anker}
        lijst={lijst}
        sluit={() => {
          setOpen(null);
          void laad();
        }}
      />
    );
  }

  const dagen = groepeerPerDag(lijst.ritten, periode.van, periode.tot);
  const naamVan = (id: string | null) => {
    const v = id ? lijst.voertuigen.find((x) => x.id === id) : undefined;
    return v ? voertuigNaam(v) : "";
  };
  const actieveVoertuigen = lijst.voertuigen.filter((v) => !v.gearchiveerd);

  return (
    <div className="space-y-4">
      <Foutregel tekst={fout} />

      {lijst.apk.length > 0 && (
        <div className={kaart} role="status">
          <h2 className="text-sm font-semibold text-ink">APK binnen 30 dagen</h2>
          <ul className="mt-1 space-y-0.5 text-sm text-neutralx-600">
            {lijst.apk.map((m) => (
              <li key={m.voertuig.id}>
                <span className="font-medium text-ink">{voertuigNaam(m.voertuig)}</span>:{" "}
                {m.dagen < 0 ? <span className="text-crit">APK verlopen op {korteDag(m.voertuig.apk ?? "")}</span> : m.dagen === 0 ? <span className="text-warn">APK verloopt vandaag</span> : <span className="text-warn">APK verloopt over {m.dagen} {m.dagen === 1 ? "dag" : "dagen"} ({korteDag(m.voertuig.apk ?? "")})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <button type="button" className={`${knopKlein} py-2`} aria-label={modus === "dag" ? "Vorige dag" : "Vorige week"} onClick={() => setAnker(plusDagen(anker, modus === "dag" ? -1 : -7))}>
            ‹
          </button>
          <button type="button" className={`${knopKlein} py-2`} onClick={() => setAnker(amsterdamDayKey(new Date()))}>
            Vandaag
          </button>
          <button type="button" className={`${knopKlein} py-2`} aria-label={modus === "dag" ? "Volgende dag" : "Volgende week"} onClick={() => setAnker(plusDagen(anker, modus === "dag" ? 1 : 7))}>
            ›
          </button>
        </div>
        <div role="group" aria-label="Weergave" className="flex gap-1">
          {(["dag", "week"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={modus === m} className={`${knopKlein} py-2 ${modus === m ? "bg-brand-50 text-brand-700" : ""}`} onClick={() => setModus(m)}>
              {m === "dag" ? "Dag" : "Week"}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="field-label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as RitStatus | "")} className="field-input">
            <option value="">Alle</option>
            {STATUSSEN.map((s) => (
              <option key={s} value={s}>
                {STATUS_NAAM[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Voertuig</span>
          <select value={voertuig} onChange={(e) => setVoertuig(e.target.value)} className="field-input">
            <option value="">Alle</option>
            {lijst.voertuigen.map((v) => (
              <option key={v.id} value={v.id}>
                {voertuigNaam(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Chauffeur</span>
          <select value={chauffeur} onChange={(e) => setChauffeur(e.target.value)} className="field-input">
            <option value="">Alle</option>
            {lijst.chauffeurs.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-primary ml-auto px-3 py-2 text-sm" onClick={() => setOpen({ rit: null })}>
          Nieuwe rit
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={knopKlein} aria-expanded={paneel === "voertuigen"} onClick={() => setPaneel(paneel === "voertuigen" ? null : "voertuigen")}>
          Voertuigen ({actieveVoertuigen.length})
        </button>
        <button type="button" className={knopKlein} aria-expanded={paneel === "chauffeurs"} onClick={() => setPaneel(paneel === "chauffeurs" ? null : "chauffeurs")}>
          Chauffeurs ({lijst.chauffeurs.length})
        </button>
      </div>

      {paneel === "voertuigen" && <VoertuigenBeheer voertuigen={lijst.voertuigen} ververs={() => void laad()} />}
      {paneel === "chauffeurs" && <ChauffeursBeheer chauffeurs={lijst.chauffeurs} ververs={() => void laad()} />}

      <h2 className="font-display text-lg font-bold text-ink">{modus === "dag" ? dagNaam(anker) : `Week van ${korteDag(periode.van)} tot ${korteDag(periode.tot)}`}</h2>

      {dagen.map(({ dag, ritten }) => (
        <section key={dag} aria-label={dagNaam(dag)}>
          {modus === "week" && <h3 className="mb-1 text-sm font-semibold capitalize text-ink">{dagNaam(dag)}</h3>}
          {ritten.length === 0 ? (
            <p className="text-sm text-neutralx-600">{modus === "dag" ? "Geen ritten op deze dag." : "Geen ritten."}</p>
          ) : (
            <ul className="space-y-2">
              {ritten.map((r) => (
                <li key={r.id} className={kaart}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{r.nummer}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_KLEUR[r.status]}`}>{STATUS_NAAM[r.status]}</span>
                    <span className="text-xs text-neutralx-600">
                      {amsterdamClock(r.start)} – {amsterdamClock(r.eind)}
                      {amsterdamDayKey(r.eind) !== amsterdamDayKey(r.start) ? ` (${korteDag(amsterdamDayKey(r.eind))})` : ""}
                    </span>
                    <span className="ml-auto text-xs text-neutralx-600">
                      {urenTekst(ritUren(r))}
                      {r.km !== null ? ` · ${kmTekst(r.km)}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink">{r.klantGewist && !r.van && !r.naar ? "Klantgegevens gewist" : `${r.van} → ${[...r.tussenstops, r.naar].join(" → ")}`}</p>
                  <p className="text-xs text-neutralx-600">
                    {[r.klantNaam, naamVan(r.voertuigId), r.chauffeur].filter(Boolean).join(" · ") || "Nog geen klant, voertuig of chauffeur"}
                  </p>
                  {r.lading && <p className="line-clamp-2 text-xs text-neutralx-600">{r.lading}</p>}
                  {(lijst.waarschuwingen[r.id] ?? []).map((w) => (
                    <p key={w} role="alert" className="mt-1 text-xs font-medium text-warn">
                      Let op: {w}
                    </p>
                  ))}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {OVERGANGEN[r.status].map((naar) => (
                      <button key={naar} type="button" className={knopKlein} onClick={() => void zetStatus(r, naar)}>
                        {KNOP_TEKST(r.status, naar)}
                      </button>
                    ))}
                    <button type="button" className={knopKlein} onClick={() => setOpen({ rit: r })}>
                      Openen
                    </button>
                    <a className={knopKlein} href={`/werkgever/ritten/${r.id}/print`}>
                      Vrachtbrief
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {lijst.totalen && <TotalenPaneel totalen={lijst.totalen} voertuigen={lijst.voertuigen} />}

      <p className="text-xs text-neutralx-600">
        Uren en kilometers zijn handmatig: de duur komt uit de tijden die je invult (de werkelijke als die er zijn, anders de geplande) en de kilometers vul je zelf in. Dit onderdeel gebruikt geen GPS, rekent geen route uit en is niet gekoppeld aan het goedkeuren van uren of aan facturen.
      </p>
    </div>
  );
}

// --- totalen -----------------------------------------------------------------------

function TotalenPaneel({ totalen, voertuigen }: { totalen: Totalen; voertuigen: Voertuig[] }) {
  const voertuigLabel = (id: string) => {
    const v = voertuigen.find((x) => x.id === id);
    return id ? (v ? voertuigNaam(v) : "Onbekend voertuig") : "Geen voertuig";
  };
  const tabel = (titel: string, rijen: Totalen["perChauffeur"], label: (s: string) => string) => (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutralx-600">{titel}</h3>
      {rijen.length === 0 ? (
        <p className="mt-1 text-sm text-neutralx-600">Geen ritten in deze periode.</p>
      ) : (
        <table className="mt-1 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairstrong text-ink">
              <th className="py-1 pr-2 font-semibold">Naam</th>
              <th className="py-1 pr-2 text-right font-semibold">Ritten</th>
              <th className="py-1 pr-2 text-right font-semibold">Uren</th>
              <th className="py-1 text-right font-semibold">Kilometers</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map((r) => (
              <tr key={r.sleutel} className="border-b border-hair text-ink">
                <td className="py-1 pr-2">{label(r.sleutel)}</td>
                <td className="py-1 pr-2 text-right">{r.aantal}</td>
                <td className="py-1 pr-2 text-right">{urenTekst(r.uren)}</td>
                <td className="py-1 text-right">{kmTekst(r.km)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
  return (
    <div className={`${kaart} space-y-4`}>
      <h2 className="text-sm font-semibold text-ink">
        Totalen van {korteDag(totalen.van)} tot {korteDag(totalen.tot)}: {totalen.totaal.aantal} ritten, {urenTekst(totalen.totaal.uren)}, {kmTekst(totalen.totaal.km)}
      </h2>
      {tabel("Per chauffeur", totalen.perChauffeur, (s) => s || "Geen chauffeur")}
      {tabel("Per voertuig", totalen.perVoertuig, voertuigLabel)}
      <p className="text-xs text-neutralx-600">Geannuleerde ritten tellen niet mee. Een rit die nog niet is gereden telt met zijn geplande duur.</p>
    </div>
  );
}

// --- één rit --------------------------------------------------------------------------

interface Vorm {
  start: string;
  eind: string;
  van: string;
  naar: string;
  tussenstops: string;
  klantNaam: string;
  lading: string;
  voertuigId: string;
  chauffeur: string;
  werkelijkStart: string;
  werkelijkEind: string;
  km: string;
  opmerking: string;
}

const vormVan = (r: Rit | null, dag: string): Vorm =>
  r
    ? {
        start: amsterdamLocalInput(r.start),
        eind: amsterdamLocalInput(r.eind),
        van: r.van,
        naar: r.naar,
        tussenstops: r.tussenstops.join("\n"),
        klantNaam: r.klantNaam,
        lading: r.lading,
        voertuigId: r.voertuigId ?? "",
        chauffeur: r.chauffeur,
        werkelijkStart: r.werkelijkStart ? amsterdamLocalInput(r.werkelijkStart) : "",
        werkelijkEind: r.werkelijkEind ? amsterdamLocalInput(r.werkelijkEind) : "",
        km: r.km === null ? "" : String(r.km).replace(".", ","),
        opmerking: r.opmerking,
      }
    : { start: `${dag}T08:00`, eind: `${dag}T12:00`, van: "", naar: "", tussenstops: "", klantNaam: "", lading: "", voertuigId: "", chauffeur: "", werkelijkStart: "", werkelijkEind: "", km: "", opmerking: "" };

const bodyVan = (v: Vorm) => ({ ...v, tussenstops: v.tussenstops.split("\n").map((s) => s.trim()).filter(Boolean) });

function RitEditor({ begin, standaardDag, lijst, sluit }: { begin: Rit | null; standaardDag: string; lijst: Lijst; sluit: () => void }) {
  const [rit, setRit] = useState<Rit | null>(begin);
  const [v, setV] = useState<Vorm>(() => vormVan(begin, standaardDag));
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [waarschuwingen, setWaarschuwingen] = useState<string[]>([]);
  const [wisVraag, setWisVraag] = useState<"klant" | "rit" | null>(null);

  const zet = (k: keyof Vorm, w: string) => {
    setV((o) => ({ ...o, [k]: w }));
    setMelding(null);
  };
  const veld = (k: keyof Vorm) => ({ value: v[k], onChange: (e: { target: { value: string } }) => zet(k, e.target.value) });
  const voertuigen = lijst.voertuigen.filter((x) => !x.gearchiveerd || x.id === rit?.voertuigId);
  const chauffeurs = rit?.chauffeur && !lijst.chauffeurs.some((c) => c.toLowerCase() === rit.chauffeur.toLowerCase()) ? [...lijst.chauffeurs, rit.chauffeur] : lijst.chauffeurs;
  const uren = rit ? ritUren(rit) : null;

  async function bewaar() {
    setFout(null);
    setMelding(null);
    const { ok, data } = await lees<{ rit: Rit; waarschuwingen: string[] }>(await verstuur(rit ? `/api/werkgever/ritten/${rit.id}` : "/api/werkgever/ritten", rit ? "PUT" : "POST", bodyVan(v)));
    if (!ok || !data?.rit) {
      setFout(data?.error?.message ?? "De rit kon niet worden opgeslagen.");
      return;
    }
    // de serverversie is leidend (de server kan velden anders opslaan dan ingevuld)
    setRit(data.rit);
    setV(vormVan(data.rit, standaardDag));
    setWaarschuwingen(data.waarschuwingen ?? []);
    setMelding(`Opgeslagen als ${data.rit.nummer}.`);
  }

  async function wisKlant() {
    if (!rit) return;
    setFout(null);
    setWisVraag(null);
    const { ok, data } = await lees<{ rit: Rit }>(await verstuur(`/api/werkgever/ritten/${rit.id}/wis-klant`, "POST"));
    if (!ok || !data?.rit) {
      setFout(data?.error?.message ?? "De klantgegevens konden niet worden gewist.");
      return;
    }
    setRit(data.rit);
    setV(vormVan(data.rit, standaardDag));
    setMelding("De naam van de klant en de adressen zijn gewist.");
  }

  async function verwijder() {
    if (!rit) return;
    setFout(null);
    setWisVraag(null);
    const { ok, data } = await lees<{ ok: boolean }>(await verstuur(`/api/werkgever/ritten/${rit.id}`, "DELETE"));
    if (!ok) {
      setFout(data?.error?.message ?? "De rit kon niet worden verwijderd.");
      return;
    }
    sluit();
  }

  return (
    <form
      className={`${kaart} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        void bewaar();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold text-ink">{rit ? `Rit ${rit.nummer}` : "Nieuwe rit"}</h2>
        {rit && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_KLEUR[rit.status]}`}>{STATUS_NAAM[rit.status]}</span>}
        {uren !== null && <span className="text-xs text-neutralx-600">{urenTekst(uren)}</span>}
        <button type="button" className={`${knopKlein} ml-auto`} onClick={sluit}>
          Terug naar de lijst
        </button>
      </div>

      <Foutregel tekst={fout} />
      {melding && (
        <p role="status" className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-ink">
          {melding}
        </p>
      )}
      {waarschuwingen.map((w) => (
        <p key={w} role="alert" className="rounded-xl bg-paper-soft px-4 py-3 text-sm font-medium text-warn">
          Let op: {w} De rit is wel opgeslagen.
        </p>
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Geplande start</span>
          <input type="datetime-local" required className="field-input" {...veld("start")} />
        </label>
        <label className="block">
          <span className="field-label">Gepland einde</span>
          <input type="datetime-local" required className="field-input" {...veld("eind")} />
        </label>
        <label className="block">
          <span className="field-label">Van (adres of plaats)</span>
          <input className="field-input" maxLength={200} {...veld("van")} />
        </label>
        <label className="block">
          <span className="field-label">Naar (adres of plaats)</span>
          <input className="field-input" maxLength={200} {...veld("naar")} />
        </label>
      </div>
      <label className="block">
        <span className="field-label">Tussenstops (één adres per regel, hooguit {MAX_TUSSENSTOPS})</span>
        <textarea rows={2} className="field-input" {...veld("tussenstops")} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="field-label">Klant (optioneel)</span>
          <input className="field-input" maxLength={80} {...veld("klantNaam")} />
        </label>
        <label className="block">
          <span className="field-label">Voertuig</span>
          <select className="field-input" {...veld("voertuigId")}>
            <option value="">Nog niet gekozen</option>
            {voertuigen.map((x) => (
              <option key={x.id} value={x.id}>
                {voertuigNaam(x)}
                {x.gearchiveerd ? " (gearchiveerd)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Chauffeur</span>
          <select className="field-input" {...veld("chauffeur")}>
            <option value="">Nog niet gekozen</option>
            {chauffeurs.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="field-label">Lading of omschrijving</span>
        <textarea rows={2} className="field-input" maxLength={300} {...veld("lading")} />
      </label>

      <fieldset className="rounded-lg border border-hair p-3">
        <legend className="px-1 text-xs font-semibold text-neutralx-600">Werkelijk (handmatig invullen)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="field-label">Werkelijke start</span>
            <input type="datetime-local" className="field-input" {...veld("werkelijkStart")} />
          </label>
          <label className="block">
            <span className="field-label">Werkelijk einde</span>
            <input type="datetime-local" className="field-input" {...veld("werkelijkEind")} />
          </label>
          <label className="block">
            <span className="field-label">Afgelegde kilometers</span>
            <input inputMode="decimal" className="field-input" {...veld("km")} />
          </label>
        </div>
        <p className="mt-1 text-xs text-neutralx-600">Als begin en einde allebei zijn ingevuld, geldt dat als duur van de rit; anders de geplande tijden. De kilometers rekent het systeem niet uit.</p>
      </fieldset>

      <label className="block">
        <span className="field-label">Opmerking</span>
        <textarea rows={2} className="field-input" maxLength={500} {...veld("opmerking")} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary px-4 py-2 text-sm">
          Opslaan
        </button>
        {rit && (
          <a className={`${knopKlein} py-2`} href={`/werkgever/ritten/${rit.id}/print`}>
            Vrachtbrief afdrukken
          </a>
        )}
        {rit && (
          <button type="button" className={`${knopKlein} py-2`} onClick={() => setWisVraag(wisVraag === "klant" ? null : "klant")}>
            Klantgegevens wissen
          </button>
        )}
        {rit && magVerwijderen(rit) && (
          <button type="button" className={`${knopKlein} py-2`} onClick={() => setWisVraag(wisVraag === "rit" ? null : "rit")}>
            Rit verwijderen
          </button>
        )}
      </div>

      {wisVraag === "klant" && (
        <div className="rounded-lg bg-paper-soft p-3 text-sm text-ink">
          <p>Dit wist de naam van de klant en de adressen (van, naar en tussenstops) van deze rit. De rit blijft bestaan met tijden, voertuig en kilometers. Wat je zelf in de lading of opmerking schreef blijft staan: haal daar zelf weg wat niet meer mag blijven. Dit kan niet ongedaan worden gemaakt.</p>
          <button type="button" className="btn-primary mt-2 px-3 py-1.5 text-sm" onClick={() => void wisKlant()}>
            Ja, wis de klantgegevens
          </button>
        </div>
      )}
      {wisVraag === "rit" && (
        <div className="rounded-lg bg-paper-soft p-3 text-sm text-ink">
          <p>De rit wordt verwijderd. Het nummer wordt niet opnieuw gebruikt.</p>
          <button type="button" className="btn-primary mt-2 px-3 py-1.5 text-sm" onClick={() => void verwijder()}>
            Ja, verwijder de rit
          </button>
        </div>
      )}
    </form>
  );
}

// --- voertuigen ------------------------------------------------------------------------

interface VoertuigVorm {
  kenteken: string;
  omschrijving: string;
  laadvermogenKg: string;
  apk: string;
  notitie: string;
}

const leegVoertuig: VoertuigVorm = { kenteken: "", omschrijving: "", laadvermogenKg: "", apk: "", notitie: "" };

function VoertuigenBeheer({ voertuigen, ververs }: { voertuigen: Voertuig[]; ververs: () => void }) {
  const [bewerk, setBewerk] = useState<string | null>(null); // id, of "nieuw"
  const [v, setV] = useState<VoertuigVorm>(leegVoertuig);
  const [fout, setFout] = useState<string | null>(null);

  function start(x: Voertuig | null) {
    setFout(null);
    setBewerk(x ? x.id : "nieuw");
    setV(x ? { kenteken: formatKenteken(x.kenteken), omschrijving: x.omschrijving, laadvermogenKg: x.laadvermogenKg === null ? "" : String(x.laadvermogenKg), apk: x.apk ?? "", notitie: x.notitie } : leegVoertuig);
  }

  async function bewaar() {
    setFout(null);
    const nieuw = bewerk === "nieuw";
    const { ok, data } = await lees<{ voertuig: Voertuig }>(await verstuur("/api/werkgever/ritten/voertuigen", nieuw ? "POST" : "PUT", nieuw ? v : { id: bewerk, ...v }));
    if (!ok || !data?.voertuig) {
      setFout(data?.error?.message ?? "Het voertuig kon niet worden opgeslagen.");
      return;
    }
    setBewerk(null);
    ververs();
  }

  async function archief(x: Voertuig) {
    setFout(null);
    const { ok, data } = await lees<{ voertuig: Voertuig }>(await verstuur("/api/werkgever/ritten/voertuigen", "PATCH", { id: x.id, gearchiveerd: !x.gearchiveerd }));
    if (!ok) {
      setFout(data?.error?.message ?? "Het voertuig kon niet worden bijgewerkt.");
      return;
    }
    ververs();
  }

  return (
    <div className={`${kaart} space-y-3`}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Voertuigen</h2>
        <button type="button" className={`${knopKlein} ml-auto`} onClick={() => start(null)}>
          Voertuig toevoegen
        </button>
      </div>
      <Foutregel tekst={fout} />
      {voertuigen.length === 0 && <p className="text-sm text-neutralx-600">Je hebt nog geen voertuigen.</p>}
      <ul className="space-y-1">
        {voertuigen.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-2 border-b border-hair pb-1 text-sm text-ink">
            <span className="font-semibold">{formatKenteken(x.kenteken)}</span>
            <span>{x.omschrijving}</span>
            {x.laadvermogenKg !== null && <span className="text-xs text-neutralx-600">{new Intl.NumberFormat("nl-NL").format(x.laadvermogenKg)} kg</span>}
            {x.apk && <span className="text-xs text-neutralx-600">APK tot {korteDag(x.apk)} {x.apk.slice(0, 4)}</span>}
            {x.gearchiveerd && <span className="rounded-full bg-paper-soft px-2 py-0.5 text-xs text-neutralx-600">Gearchiveerd</span>}
            <span className="ml-auto flex gap-1">
              <button type="button" className={knopKlein} onClick={() => start(x)}>
                Bewerken
              </button>
              <button type="button" className={knopKlein} onClick={() => void archief(x)}>
                {x.gearchiveerd ? "Terughalen" : "Archiveren"}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {bewerk && (
        <form
          className="space-y-3 rounded-lg bg-paper-soft p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void bewaar();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Kenteken</span>
              <input className="field-input" value={v.kenteken} onChange={(e) => setV({ ...v, kenteken: e.target.value })} placeholder="AB-12-CD" maxLength={12} />
            </label>
            <label className="block">
              <span className="field-label">Omschrijving</span>
              <input className="field-input" value={v.omschrijving} onChange={(e) => setV({ ...v, omschrijving: e.target.value })} placeholder="Bestelbus Ford Transit" maxLength={80} />
            </label>
            <label className="block">
              <span className="field-label">Laadvermogen in kg (optioneel)</span>
              <input inputMode="numeric" className="field-input" value={v.laadvermogenKg} onChange={(e) => setV({ ...v, laadvermogenKg: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">APK-vervaldatum (optioneel)</span>
              <input type="date" className="field-input" value={v.apk} onChange={(e) => setV({ ...v, apk: e.target.value })} />
            </label>
          </div>
          <label className="block">
            <span className="field-label">Notitie</span>
            <input className="field-input" value={v.notitie} onChange={(e) => setV({ ...v, notitie: e.target.value })} maxLength={300} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary px-3 py-2 text-sm">
              Voertuig opslaan
            </button>
            <button type="button" className={`${knopKlein} py-2`} onClick={() => setBewerk(null)}>
              Annuleren
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// --- chauffeurs -------------------------------------------------------------------------

function ChauffeursBeheer({ chauffeurs, ververs }: { chauffeurs: string[]; ververs: () => void }) {
  const [tekst, setTekst] = useState(chauffeurs.join("\n"));
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [wisNaam, setWisNaam] = useState<string | null>(null);

  async function bewaar() {
    setFout(null);
    setMelding(null);
    const namen = tekst.split("\n").map((n) => n.trim()).filter(Boolean);
    const { ok, data } = await lees<{ chauffeurs: string[] }>(await verstuur("/api/werkgever/ritten/chauffeurs", "PUT", { namen }));
    if (!ok || !data?.chauffeurs) {
      setFout(data?.error?.message ?? "De lijst kon niet worden opgeslagen.");
      return;
    }
    setTekst(data.chauffeurs.join("\n"));
    setMelding("Opgeslagen.");
    ververs();
  }

  async function wis(naam: string) {
    setFout(null);
    setMelding(null);
    setWisNaam(null);
    const { ok, data } = await lees<{ ritten: number; chauffeurs: string[] }>(await verstuur("/api/werkgever/ritten/chauffeurs/wis", "POST", { naam }));
    if (!ok || !data?.chauffeurs) {
      setFout(data?.error?.message ?? "De naam kon niet worden gewist.");
      return;
    }
    setTekst(data.chauffeurs.join("\n"));
    setMelding(`De naam is gewist uit ${data.ritten} ${data.ritten === 1 ? "rit" : "ritten"}.`);
    ververs();
  }

  return (
    <div className={`${kaart} space-y-3`}>
      <h2 className="text-sm font-semibold text-ink">Chauffeurs</h2>
      <label className="block">
        <span className="field-label">Je chauffeurs (één naam per regel, hooguit {MAX_CHAUFFEURS})</span>
        <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={5} className="field-input" />
      </label>
      <p className="text-xs text-neutralx-600">Dit zijn gewoon namen om aan een rit te geven. Ze zijn niet gekoppeld aan accounts en er worden geen rijbewijsgegevens bewaard.</p>
      <Foutregel tekst={fout} />
      {melding && (
        <p role="status" className="text-sm text-neutralx-600">
          {melding}
        </p>
      )}
      <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => void bewaar()}>
        Lijst opslaan
      </button>

      {chauffeurs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutralx-600">Naam wissen</h3>
          <p className="text-xs text-neutralx-600">Een naam is een persoonsgegeven. Met Naam wissen verdwijnt de chauffeur uit de lijst en staat er in alle ritten waar hij reed &quot;Verwijderd&quot;. De ritten, tijden en kilometers blijven bestaan. Dit kan niet ongedaan worden gemaakt.</p>
          <ul className="mt-1 space-y-1">
            {chauffeurs.map((c) => (
              <li key={c} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                <span>{c}</span>
                {wisNaam === c ? (
                  <button type="button" className="btn-primary px-2.5 py-1 text-xs" onClick={() => void wis(c)}>
                    Ja, wis deze naam overal
                  </button>
                ) : (
                  <button type="button" className={knopKlein} onClick={() => setWisNaam(c)}>
                    Naam wissen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
