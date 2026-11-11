"use client";

import { useCallback, useEffect, useState } from "react";
import { amsterdamDayKey, amsterdamLocalInput } from "@/lib/time/amsterdam";
import {
  MAX_MATERIALEN,
  MAX_MEDEWERKERS,
  MAX_TEAM,
  MAX_UREN,
  OVERGANGEN,
  STATUSSEN,
  STATUS_NAAM,
  euroTekst,
  leegeKlant,
  magVerwijderen,
  totalen,
  urenTekst,
  type Totalen,
  type Werkbon,
  type WerkbonRegel,
  type WerkbonStatus,
} from "@/lib/werkbonnen/model";

// Het werkbonnenbeheer van een bedrijf: lijst met filter en zoeken, en een werkbon openen of maken. Alle tijden zijn Nederlandse tijd.

const kaart = "rounded-xl border border-hair bg-white p-4";
const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500";
const nieuwId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

const STATUS_KLEUR: Record<WerkbonStatus, string> = {
  nieuw: "bg-paper-soft text-ink",
  ingepland: "bg-brand-50 text-brand-700",
  bezig: "bg-brand-50 text-brand-700",
  afgerond: "bg-paper-soft text-ink",
  geannuleerd: "bg-paper-soft text-neutralx-600",
};

const datumTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

interface UrenVorm {
  id: string;
  medewerker: string;
  datum: string;
  minuten: string;
  opmerking: string;
}
interface MatVorm {
  id: string;
  omschrijving: string;
  aantal: string;
  prijs: string;
}
interface Vorm {
  klant: ReturnType<typeof leegeKlant>;
  omschrijving: string;
  start: string;
  eind: string;
  medewerkers: string[];
  uren: UrenVorm[];
  materialen: MatVorm[];
  interneNotitie: string;
  afrondNotitie: string;
}

const getal = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s.trim().replace(",", ".")));
const euroVeld = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));

const vormVan = (b: Werkbon | null): Vorm =>
  b
    ? {
        klant: { ...b.klant },
        omschrijving: b.omschrijving,
        start: b.start ? amsterdamLocalInput(b.start) : "",
        eind: b.eind ? amsterdamLocalInput(b.eind) : "",
        medewerkers: [...b.medewerkers],
        uren: b.uren.map((r) => ({ id: r.id, medewerker: r.medewerker, datum: r.datum, minuten: String(r.minuten), opmerking: r.opmerking })),
        materialen: b.materialen.map((m) => ({ id: m.id, omschrijving: m.omschrijving, aantal: String(m.aantal).replace(".", ","), prijs: euroVeld(m.prijsCent) })),
        interneNotitie: b.interneNotitie,
        afrondNotitie: b.afrondNotitie,
      }
    : { klant: leegeKlant(), omschrijving: "", start: "", eind: "", medewerkers: [], uren: [], materialen: [], interneNotitie: "", afrondNotitie: "" };

/** De body voor de API; een kapotte waarde gaat mee als niet-getal, dan zegt de server precies wat er niet klopt. */
const bodyVan = (v: Vorm) => ({
  klant: v.klant,
  omschrijving: v.omschrijving,
  start: v.start,
  eind: v.eind,
  medewerkers: v.medewerkers,
  uren: v.uren.map((r) => ({ id: r.id, medewerker: r.medewerker, datum: r.datum, minuten: getal(r.minuten), opmerking: r.opmerking })),
  materialen: v.materialen.map((m) => ({ id: m.id, omschrijving: m.omschrijving, aantal: getal(m.aantal), prijsCent: m.prijs.trim() === "" ? null : Number.isFinite(getal(m.prijs)) ? Math.round(getal(m.prijs) * 100) : "ongeldig" })),
  interneNotitie: v.interneNotitie,
  afrondNotitie: v.afrondNotitie,
});

interface Lijst {
  bonnen: WerkbonRegel[];
  aantallen: Record<string, number>;
  totaal: number;
  team: string[];
}

async function lees<T>(res: Response): Promise<{ ok: boolean; data: (T & { error?: { code?: string; message?: string; details?: { code?: string } } }) | null }> {
  return { ok: res.ok, data: (await res.json().catch(() => null)) as (T & { error?: { code?: string; message?: string; details?: { code?: string } } }) | null };
}

export function WerkbonnenBeheer() {
  const [lijst, setLijst] = useState<Lijst | null>(null);
  const [status, setStatus] = useState<WerkbonStatus | "">("");
  const [q, setQ] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<{ bon: Werkbon | null } | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);

  const laad = useCallback(async () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q.trim()) p.set("q", q.trim());
    try {
      const { ok, data } = await lees<Lijst>(await fetch(`/api/werkgever/werkbonnen?${p}`, { cache: "no-store" }));
      if (!ok || !data?.bonnen) {
        setFout(data?.error?.message ?? "De werkbonnen konden niet worden geladen. Vernieuw de pagina.");
        return;
      }
      setFout(null);
      setLijst(data);
    } catch {
      setFout("De werkbonnen konden niet worden geladen. Controleer je verbinding.");
    }
  }, [status, q]);

  useEffect(() => {
    const t = setTimeout(() => void laad(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [laad, q]);

  async function openBon(id: string) {
    setFout(null);
    const { ok, data } = await lees<{ bon: Werkbon }>(await fetch(`/api/werkgever/werkbonnen/${id}`, { cache: "no-store" }));
    if (!ok || !data?.bon) {
      setFout(data?.error?.message ?? "De werkbon kon niet worden geopend.");
      return;
    }
    setOpen({ bon: data.bon });
  }

  if (!lijst) {
    return fout ? (
      <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
        {fout}
      </p>
    ) : (
      <p className="text-sm text-neutralx-500">Laden…</p>
    );
  }

  if (open) {
    return (
      <Editor
        key={open.bon?.id ?? "nieuw"}
        begin={open.bon}
        team={lijst.team}
        sluit={() => {
          setOpen(null);
          void laad();
        }}
        ververs={() => void laad()}
      />
    );
  }

  return (
    <div className="space-y-4">
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="field-label">Zoeken</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nummer, klant of adres" className="field-input w-64" />
        </label>
        <label className="block">
          <span className="field-label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as WerkbonStatus | "")} className="field-input">
            <option value="">Alle ({lijst.totaal})</option>
            {STATUSSEN.map((s) => (
              <option key={s} value={s}>
                {STATUS_NAAM[s]} ({lijst.aantallen[s] ?? 0})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={`${knopKlein} py-2`} onClick={() => setTeamOpen((o) => !o)}>
          Medewerkers ({lijst.team.length})
        </button>
        <button type="button" className="btn-primary ml-auto px-3 py-2 text-sm" onClick={() => setOpen({ bon: null })}>
          Nieuwe werkbon
        </button>
      </div>

      {teamOpen && <TeamBeheer team={lijst.team} bewaard={(team) => setLijst({ ...lijst, team })} />}

      {lijst.bonnen.length === 0 ? (
        <p className={`${kaart} text-sm text-neutralx-600`}>{lijst.totaal === 0 ? "Je hebt nog geen werkbonnen. Maak je eerste met de knop Nieuwe werkbon." : "Geen werkbonnen gevonden met dit filter."}</p>
      ) : (
        <ul className="space-y-2">
          {lijst.bonnen.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => void openBon(b.id)} className={`${kaart} block w-full text-left hover:border-brand-500`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{b.nummer}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_KLEUR[b.status]}`}>{STATUS_NAAM[b.status]}</span>
                  {b.start && <span className="text-xs text-neutralx-600">{datumTijd(b.start)}</span>}
                  <span className="ml-auto text-xs text-neutralx-600">
                    {urenTekst(b.totalen.uren)} uur · {euroTekst(b.totalen.materiaalCent)} materiaal
                  </span>
                </span>
                <span className="mt-1 block text-sm text-ink">{b.klantNaam || "Geen klantnaam"}</span>
                {b.adres && <span className="block text-xs text-neutralx-600">{b.adres}</span>}
                <span className="mt-1 line-clamp-2 block text-xs text-neutralx-600">{b.omschrijving}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- medewerkerslijst --------------------------------------------------------

function TeamBeheer({ team, bewaard }: { team: string[]; bewaard: (t: string[]) => void }) {
  const [tekst, setTekst] = useState(team.join("\n"));
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState(false);

  async function bewaar() {
    setFout(null);
    setKlaar(false);
    const namen = tekst.split("\n").map((n) => n.trim()).filter(Boolean);
    const { ok, data } = await lees<{ team: string[] }>(await fetch("/api/werkgever/werkbonnen/team", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ namen }) }));
    if (!ok || !data?.team) {
      setFout(data?.error?.message ?? "De lijst kon niet worden opgeslagen.");
      return;
    }
    bewaard(data.team);
    setTekst(data.team.join("\n"));
    setKlaar(true);
  }

  return (
    <div className={kaart}>
      <label className="block">
        <span className="field-label">Je medewerkers (één naam per regel, hooguit {MAX_TEAM})</span>
        <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={5} className="field-input" />
      </label>
      <p className="mt-1 text-xs text-neutralx-600">Dit zijn gewoon namen om aan een werkbon te geven. Ze zijn niet gekoppeld aan accounts.</p>
      {fout && (
        <p role="alert" className="mt-2 rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
          {fout}
        </p>
      )}
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => void bewaar()}>
          Lijst opslaan
        </button>
        {klaar && <span className="text-sm text-neutralx-600">Opgeslagen.</span>}
      </div>
    </div>
  );
}

// --- één werkbon ------------------------------------------------------------

function Editor({ begin, team, sluit, ververs }: { begin: Werkbon | null; team: string[]; sluit: () => void; ververs: () => void }) {
  const [bon, setBon] = useState<Werkbon | null>(begin);
  const [v, setV] = useState<Vorm>(() => vormVan(begin));
  const [vuil, setVuil] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [zonderVraag, setZonderVraag] = useState<WerkbonStatus | null>(null);
  const [bezig, setBezig] = useState(false);

  const wijzig = (f: (oud: Vorm) => Vorm) => {
    setV(f);
    setVuil(true);
    setMelding(null);
  };

  // de totalen volgen wat er nu in het formulier staat
  const live: Totalen = totalen({
    uren: v.uren.map((r) => ({ id: r.id, medewerker: r.medewerker, datum: r.datum, minuten: Number.isFinite(getal(r.minuten)) ? getal(r.minuten) : 0, opmerking: r.opmerking })),
    materialen: v.materialen.map((m) => ({ id: m.id, omschrijving: m.omschrijving, aantal: Number.isFinite(getal(m.aantal)) ? getal(m.aantal) : 0, prijsCent: m.prijs.trim() === "" || !Number.isFinite(getal(m.prijs)) ? null : Math.round(getal(m.prijs) * 100) })),
  });

  /** Neemt de serverversie over (de server kan bijeffecten hebben) en zet het formulier daarop. */
  const neemOver = (b: Werkbon) => {
    setBon(b);
    setV(vormVan(b));
    setVuil(false);
  };

  async function bewaar(): Promise<Werkbon | null> {
    setFout(null);
    setMelding(null);
    const url = bon ? `/api/werkgever/werkbonnen/${bon.id}` : "/api/werkgever/werkbonnen";
    const { ok, data } = await lees<{ bon: Werkbon }>(await fetch(url, { method: bon ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyVan(v)) }));
    if (!ok || !data?.bon) {
      setFout(data?.error?.message ?? "De werkbon kon niet worden opgeslagen.");
      return null;
    }
    neemOver(data.bon);
    setMelding(`Opgeslagen als ${data.bon.nummer}.`);
    ververs();
    return data.bon;
  }

  async function zet(naar: WerkbonStatus, zonderUren = false) {
    setBezig(true);
    setFout(null);
    setZonderVraag(null);
    try {
      let huidig = bon;
      if (!huidig || vuil) {
        huidig = await bewaar();
        if (!huidig) return;
      }
      const { ok, data } = await lees<{ bon: Werkbon }>(await fetch(`/api/werkgever/werkbonnen/${huidig.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: naar, zonderUren }) }));
      if (!ok || !data?.bon) {
        if (data?.error?.details?.code === "ZONDER_UREN") setZonderVraag(naar);
        else setFout(data?.error?.message ?? "De status kon niet worden gezet.");
        return;
      }
      neemOver(data.bon);
      setMelding(`De werkbon is nu ${STATUS_NAAM[data.bon.status].toLowerCase()}.`);
      ververs();
    } finally {
      setBezig(false);
    }
  }

  async function verwijder() {
    if (!bon || !window.confirm(`Werkbon ${bon.nummer} definitief verwijderen?`)) return;
    const { ok, data } = await lees<{ ok: boolean }>(await fetch(`/api/werkgever/werkbonnen/${bon.id}`, { method: "DELETE" }));
    if (!ok) {
      setFout(data?.error?.message ?? "De werkbon kon niet worden verwijderd.");
      return;
    }
    sluit();
  }

  async function wisKlant() {
    if (!bon || !window.confirm("De naam, het telefoonnummer, het e-mailadres en het adres van de klant van deze werkbon wissen? Dit kan niet ongedaan worden gemaakt.")) return;
    const { ok, data } = await lees<{ bon: Werkbon }>(await fetch(`/api/werkgever/werkbonnen/${bon.id}/wis-klant`, { method: "POST" }));
    if (!ok || !data?.bon) {
      setFout(data?.error?.message ?? "De klantgegevens konden niet worden gewist.");
      return;
    }
    neemOver(data.bon);
    setMelding("De klantgegevens zijn gewist. De werkbon zelf is gebleven.");
    ververs();
  }

  const setKlant = (veld: keyof Vorm["klant"], waarde: string) => wijzig((o) => ({ ...o, klant: { ...o.klant, [veld]: waarde } }));
  const mogelijk = bon ? OVERGANGEN[bon.status] : [];
  const namenKeuze = [...new Set([...team, ...v.medewerkers])];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={knopKlein} onClick={sluit}>
          ‹ Terug naar de lijst
        </button>
        <h2 className="font-display text-lg font-bold text-ink">{bon ? bon.nummer : "Nieuwe werkbon"}</h2>
        {bon && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_KLEUR[bon.status]}`}>{STATUS_NAAM[bon.status]}</span>}
        {bon && (
          <a href={`/werkgever/werkbonnen/${bon.id}/print`} className={`${knopKlein} ml-auto`}>
            Afdrukken
          </a>
        )}
      </div>

      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      {melding && (
        <p role="status" className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-ink">
          {melding}
        </p>
      )}
      {zonderVraag && (
        <div role="alert" className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-ink">
          Er staan nog geen uren of materialen op deze werkbon. Weet je zeker dat je hem zonder afrondt?
          <span className="ml-3 inline-flex gap-2">
            <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => void zet(zonderVraag, true)}>
              Ja, toch afronden
            </button>
            <button type="button" className={knopKlein} onClick={() => setZonderVraag(null)}>
              Nee
            </button>
          </span>
        </div>
      )}

      {bon && mogelijk.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Status van de werkbon">
          <span className="text-xs text-neutralx-600">Zet op:</span>
          {mogelijk.map((s) => (
            <button key={s} type="button" disabled={bezig} className={knopKlein} onClick={() => void zet(s)}>
              {STATUS_NAAM[s]}
            </button>
          ))}
        </div>
      )}

      <section className={kaart}>
        <h3 className="mb-3 text-sm font-semibold text-ink">Klant (optioneel)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Naam</span>
            <input value={v.klant.naam} onChange={(e) => setKlant("naam", e.target.value)} maxLength={80} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Telefoon</span>
            <input value={v.klant.telefoon} onChange={(e) => setKlant("telefoon", e.target.value)} maxLength={25} inputMode="tel" className="field-input" />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">E-mail</span>
            <input value={v.klant.email} onChange={(e) => setKlant("email", e.target.value)} maxLength={120} type="email" className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Straat</span>
            <input value={v.klant.straat} onChange={(e) => setKlant("straat", e.target.value)} maxLength={80} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Huisnummer</span>
            <input value={v.klant.huisnummer} onChange={(e) => setKlant("huisnummer", e.target.value)} maxLength={12} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Postcode</span>
            <input value={v.klant.postcode} onChange={(e) => setKlant("postcode", e.target.value)} maxLength={10} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Plaats</span>
            <input value={v.klant.plaats} onChange={(e) => setKlant("plaats", e.target.value)} maxLength={60} className="field-input" />
          </label>
        </div>
        <p className="mt-3 text-xs text-neutralx-600">Dit zijn gegevens van je klant: bewaar alleen wat je nodig hebt voor het werk en wis ze als het kan.</p>
      </section>

      <section className={kaart}>
        <label className="block">
          <span className="field-label">Omschrijving van het werk</span>
          <textarea value={v.omschrijving} onChange={(e) => wijzig((o) => ({ ...o, omschrijving: e.target.value }))} rows={3} maxLength={2000} required className="field-input" />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Begin (Nederlandse tijd)</span>
            <input type="datetime-local" value={v.start} onChange={(e) => wijzig((o) => ({ ...o, start: e.target.value }))} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Einde (Nederlandse tijd)</span>
            <input type="datetime-local" value={v.eind} onChange={(e) => wijzig((o) => ({ ...o, eind: e.target.value }))} className="field-input" />
          </label>
        </div>
        <fieldset className="mt-3">
          <legend className="field-label">Medewerkers (hooguit {MAX_MEDEWERKERS})</legend>
          {namenKeuze.length === 0 ? (
            <p className="text-xs text-neutralx-600">Zet eerst namen in je medewerkerslijst (knop Medewerkers in de lijst).</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {namenKeuze.map((n) => (
                <label key={n} className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" checked={v.medewerkers.includes(n)} onChange={(e) => wijzig((o) => ({ ...o, medewerkers: e.target.checked ? [...o.medewerkers, n] : o.medewerkers.filter((m) => m !== n) }))} />
                  {n}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </section>

      <section className={kaart}>
        <h3 className="mb-3 text-sm font-semibold text-ink">Uren</h3>
        <div className="space-y-2">
          {v.uren.map((r, n) => (
            <div key={r.id} className="grid gap-2 sm:grid-cols-[1fr_9rem_6rem_1fr_auto] sm:items-end">
              <label className="block">
                <span className="field-label">Medewerker</span>
                <input list="werkbon-namen" value={r.medewerker} onChange={(e) => wijzig((o) => ({ ...o, uren: o.uren.map((x, i) => (i === n ? { ...x, medewerker: e.target.value } : x)) }))} maxLength={60} className="field-input" />
              </label>
              <label className="block">
                <span className="field-label">Datum</span>
                <input type="date" value={r.datum} onChange={(e) => wijzig((o) => ({ ...o, uren: o.uren.map((x, i) => (i === n ? { ...x, datum: e.target.value } : x)) }))} className="field-input" />
              </label>
              <label className="block">
                <span className="field-label">Minuten</span>
                <input inputMode="numeric" value={r.minuten} onChange={(e) => wijzig((o) => ({ ...o, uren: o.uren.map((x, i) => (i === n ? { ...x, minuten: e.target.value } : x)) }))} className="field-input" />
              </label>
              <label className="block">
                <span className="field-label">Opmerking</span>
                <input value={r.opmerking} onChange={(e) => wijzig((o) => ({ ...o, uren: o.uren.map((x, i) => (i === n ? { ...x, opmerking: e.target.value } : x)) }))} maxLength={200} className="field-input" />
              </label>
              <button type="button" className={knopKlein} aria-label={`Urenregel ${n + 1} weghalen`} onClick={() => wijzig((o) => ({ ...o, uren: o.uren.filter((_, i) => i !== n) }))}>
                Weghalen
              </button>
            </div>
          ))}
        </div>
        <datalist id="werkbon-namen">
          {namenKeuze.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={knopKlein}
            disabled={v.uren.length >= MAX_UREN}
            onClick={() => wijzig((o) => ({ ...o, uren: [...o.uren, { id: nieuwId(), medewerker: o.medewerkers[0] ?? "", datum: o.start ? o.start.slice(0, 10) : amsterdamDayKey(new Date()), minuten: "", opmerking: "" }] }))}
          >
            Urenregel toevoegen
          </button>
          <span className="text-sm text-neutralx-600">Totaal: {urenTekst(live.uren)} uur</span>
        </div>
      </section>

      <section className={kaart}>
        <h3 className="mb-3 text-sm font-semibold text-ink">Materialen</h3>
        <div className="space-y-2">
          {v.materialen.map((m, n) => (
            <div key={m.id} className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-end">
              <label className="block">
                <span className="field-label">Omschrijving</span>
                <input value={m.omschrijving} onChange={(e) => wijzig((o) => ({ ...o, materialen: o.materialen.map((x, i) => (i === n ? { ...x, omschrijving: e.target.value } : x)) }))} maxLength={120} className="field-input" />
              </label>
              <label className="block">
                <span className="field-label">Aantal</span>
                <input inputMode="decimal" value={m.aantal} onChange={(e) => wijzig((o) => ({ ...o, materialen: o.materialen.map((x, i) => (i === n ? { ...x, aantal: e.target.value } : x)) }))} className="field-input" />
              </label>
              <label className="block">
                <span className="field-label">Prijs per stuk (€)</span>
                <input inputMode="decimal" value={m.prijs} placeholder="geen prijs" onChange={(e) => wijzig((o) => ({ ...o, materialen: o.materialen.map((x, i) => (i === n ? { ...x, prijs: e.target.value } : x)) }))} className="field-input" />
              </label>
              <button type="button" className={knopKlein} aria-label={`Materiaalregel ${n + 1} weghalen`} onClick={() => wijzig((o) => ({ ...o, materialen: o.materialen.filter((_, i) => i !== n) }))}>
                Weghalen
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={knopKlein} disabled={v.materialen.length >= MAX_MATERIALEN} onClick={() => wijzig((o) => ({ ...o, materialen: [...o.materialen, { id: nieuwId(), omschrijving: "", aantal: "1", prijs: "" }] }))}>
            Materiaalregel toevoegen
          </button>
          <span className="text-sm text-neutralx-600">Totaal: {euroTekst(live.materiaalCent)}</span>
        </div>
        {live.regelsZonderPrijs > 0 && (
          <p role="status" className="mt-2 rounded-lg bg-paper-soft px-3 py-2 text-xs text-ink">
            Let op: {live.regelsZonderPrijs} regel{live.regelsZonderPrijs === 1 ? "" : "s"} zonder prijs. {live.regelsZonderPrijs === 1 ? "Die telt" : "Die tellen"} niet mee in het totaal.
          </p>
        )}
      </section>

      <section className={kaart}>
        <label className="block">
          <span className="field-label">Interne notitie (alleen voor jou en je team)</span>
          <textarea value={v.interneNotitie} onChange={(e) => wijzig((o) => ({ ...o, interneNotitie: e.target.value }))} rows={2} maxLength={2000} className="field-input" />
        </label>
        <label className="mt-3 block">
          <span className="field-label">Afrondnotitie (komt op de afdruk)</span>
          <textarea value={v.afrondNotitie} onChange={(e) => wijzig((o) => ({ ...o, afrondNotitie: e.target.value }))} rows={2} maxLength={2000} className="field-input" />
        </label>
        {bon?.afgerondOp && <p className="mt-2 text-xs text-neutralx-600">Afgerond op {datumTijd(bon.afgerondOp)}.</p>}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary px-4 py-2 text-sm" disabled={bezig} onClick={() => void bewaar()}>
          {bon ? "Opslaan" : "Werkbon maken"}
        </button>
        {vuil && <span className="text-xs text-neutralx-600">Er zijn wijzigingen die nog niet zijn opgeslagen.</span>}
        {bon && (
          <button type="button" className={`${knopKlein} ml-auto`} onClick={() => void wisKlant()}>
            Klantgegevens wissen
          </button>
        )}
        {bon && magVerwijderen(bon) && (
          <button type="button" className={knopKlein} onClick={() => void verwijder()}>
            Werkbon verwijderen
          </button>
        )}
      </div>
      {bon && (
        <p className="text-xs text-neutralx-600">
          Klantgegevens wissen haalt de naam, het telefoonnummer, het e-mailadres en het adres van de klant weg. De werkbon blijft staan met uren en materialen; wat je zelf in de omschrijving of notities schreef blijft staan. Verwijderen kan alleen als de werkbon nieuw of geannuleerd is.
        </p>
      )}
    </div>
  );
}
