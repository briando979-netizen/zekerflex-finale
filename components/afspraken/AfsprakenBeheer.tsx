"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_NAAM, WEEKDAG_NAAM, WEEK_VOLGORDE, STAPPEN, type Afspraak, type AfspraakStatus, type Instellingen, type Tijdvak } from "@/lib/afspraken/model";
import { ALLEEN_BEHEERDER, ALLEEN_BEHEERDER_TEKST } from "@/lib/afspraken/teksten";

// Het afsprakenbeheer van een bedrijf: de agenda van de week en de instellingen. Alle tijden zijn Nederlandse tijd.

const klok = (iso: string) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const dagKey = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date(iso)); // 2026-11-12
const dagDatum = (dag: string) => new Date(`${dag}T12:00:00Z`);
const dagLang = (dag: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dagDatum(dag));
const plusDagen = (dag: string, n: number) => new Date(dagDatum(dag).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const euroVeld = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const centUitVeld = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Number.NaN;
};

interface Lading {
  instellingen: Instellingen;
  nieuw: boolean;
  vandaag: string;
  van: string;
  tot: string;
  afspraken: Afspraak[];
}

const VOORLOOP = [0, 30, 60, 120, 240, 720, 1440, 2880];
const voorloopTekst = (m: number) => (m === 0 ? "Geen" : m < 60 ? `${m} minuten` : m < 1440 ? `${m / 60} uur` : `${m / 1440} dag${m === 1440 ? "" : "en"}`);

const kaart = "rounded-xl border border-hair bg-white p-4";
const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500";

export function AfsprakenBeheer() {
  const [tab, setTab] = useState<"agenda" | "instellingen">("agenda");
  const [lading, setLading] = useState<Lading | null>(null);
  const [van, setVan] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [alleenBeheerder, setAlleenBeheerder] = useState(false);

  const laad = useCallback(async (v: string | null) => {
    setFout(null);
    const q = v ? `?van=${v}&tot=${plusDagen(v, 6)}` : "";
    try {
      const res = await fetch(`/api/werkgever/afspraken${q}`, { cache: "no-store" });
      const d = (await res.json().catch(() => null)) as (Lading & { error?: { code?: string; message?: string } }) | null;
      if (res.status === 423 && d?.error?.code === ALLEEN_BEHEERDER) {
        setAlleenBeheerder(true);
        return;
      }
      if (!res.ok || !d?.instellingen) {
        setFout(d?.error?.message ?? "De agenda kon niet worden geladen. Vernieuw de pagina.");
        return;
      }
      setLading(d);
      setVan(d.van);
      if (d.nieuw) setTab("instellingen");
    } catch {
      setFout("De agenda kon niet worden geladen. Controleer je verbinding.");
    }
  }, []);

  useEffect(() => {
    void laad(null);
  }, [laad]);

  if (alleenBeheerder) {
    return (
      <p role="status" className="rounded-xl bg-paper-soft px-4 py-4 text-sm text-neutralx-600">
        {ALLEEN_BEHEERDER_TEKST}
      </p>
    );
  }
  if (!lading) {
    return fout ? (
      <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
        {fout}
      </p>
    ) : (
      <p className="text-sm text-neutralx-500">Laden…</p>
    );
  }

  return (
    <div>
      <div role="tablist" aria-label="Afspraken" className="flex gap-1 border-b border-hair">
        {(["agenda", "instellingen"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t ? "border-brand-600 text-ink" : "border-transparent text-neutralx-500 hover:text-ink"}`}>
            {t === "agenda" ? "Agenda" : "Instellingen"}
          </button>
        ))}
      </div>
      {fout && (
        <p role="alert" className="mt-3 rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      <div className="mt-5">
        {tab === "agenda" ? (
          <Agenda lading={lading} van={van ?? lading.van} setVan={(v) => void laad(v)} ververs={() => void laad(van)} setFout={setFout} />
        ) : (
          <InstellingenFormulier begin={lading.instellingen} nieuw={lading.nieuw} bewaard={(i) => setLading({ ...lading, instellingen: i, nieuw: false })} />
        )}
      </div>
    </div>
  );
}

// --- agenda ------------------------------------------------------------------

function Agenda({ lading, van, setVan, ververs, setFout }: { lading: Lading; van: string; setVan: (v: string) => void; ververs: () => void; setFout: (f: string | null) => void }) {
  const i = lading.instellingen;
  const [open, setOpen] = useState(false);
  const dagen = useMemo(() => Array.from({ length: 7 }, (_, n) => plusDagen(van, n)), [van]);
  const perDag = useMemo(() => {
    const m = new Map<string, Afspraak[]>();
    for (const a of lading.afspraken) m.set(dagKey(a.start), [...(m.get(dagKey(a.start)) ?? []), a]);
    return m;
  }, [lading.afspraken]);

  async function zet(a: Afspraak, status: AfspraakStatus) {
    setFout(null);
    const res = await fetch(`/api/werkgever/afspraken/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setFout(d?.error?.message ?? "De status kon niet worden gezet.");
      return;
    }
    ververs();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={knopKlein} onClick={() => setVan(plusDagen(van, -7))} aria-label="Vorige week">
          ‹ Vorige week
        </button>
        <button type="button" className={knopKlein} onClick={() => setVan(lading.vandaag)}>
          Vandaag
        </button>
        <button type="button" className={knopKlein} onClick={() => setVan(plusDagen(van, 7))} aria-label="Volgende week">
          Volgende week ›
        </button>
        <span className="text-sm text-neutralx-600">
          {dagLang(van)} t/m {dagLang(plusDagen(van, 6))}
        </span>
        <button type="button" className="btn-primary ml-auto px-3 py-2 text-sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Sluiten" : "Nieuwe afspraak"}
        </button>
      </div>

      {i.actief && i.slug && <BoekLink slug={i.slug} />}
      {open && (
        <NieuweAfspraak
          i={i}
          klaar={() => {
            setOpen(false);
            ververs();
          }}
        />
      )}

      <ul className="space-y-4">
        {dagen.map((d) => {
          const lijst = perDag.get(d) ?? [];
          return (
            <li key={d}>
              <h3 className={`text-sm font-bold ${d === lading.vandaag ? "text-brand-700" : "text-ink"}`}>
                {dagLang(d)}
                {d === lading.vandaag ? " (vandaag)" : ""}
              </h3>
              {lijst.length === 0 ? (
                <p className="mt-1 text-sm text-neutralx-500">Geen afspraken.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {lijst.map((a) => (
                    <li key={a.id} className={`${kaart} ${a.status === "geannuleerd" ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {klok(a.start)} – {klok(a.eind)} · {a.klant.naam}
                        </span>
                        <span className="text-xs text-neutralx-500">{STATUS_NAAM[a.status]}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-neutralx-600">
                        {a.dienstNaam} · {a.medewerkerNaam}
                        {a.bron === "balie" ? " · zelf geboekt" : ""}
                      </p>
                      {(a.klant.telefoon || a.klant.email) && (
                        <p className="mt-0.5 text-xs text-neutralx-500">
                          {[a.klant.telefoon, a.klant.email].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {a.opmerking && <p className="mt-1 text-xs text-neutralx-600">&ldquo;{a.opmerking}&rdquo;</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.status === "bevestigd" ? (
                          <>
                            <button type="button" className={knopKlein} onClick={() => void zet(a, "geweest")}>
                              Geweest
                            </button>
                            <button type="button" className={knopKlein} onClick={() => void zet(a, "niet-gekomen")}>
                              Niet gekomen
                            </button>
                            <button type="button" className={knopKlein} onClick={() => void zet(a, "geannuleerd")}>
                              Annuleren
                            </button>
                          </>
                        ) : (
                          <button type="button" className={knopKlein} onClick={() => void zet(a, "bevestigd")}>
                            Terugzetten
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutralx-500">
        Klanten en hun geschiedenis staan bij <Link href="/werkgever/klanten" className="underline underline-offset-2">Klanten</Link>.
      </p>
    </div>
  );
}

function BoekLink({ slug }: { slug: string }) {
  const [gekopieerd, setGekopieerd] = useState(false);
  const url = typeof window === "undefined" ? `/boeken/${slug}` : `${window.location.origin}/boeken/${slug}`;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-paper-soft px-4 py-3 text-sm">
      <span className="text-neutralx-600">Je boekpagina:</span>
      <a href={`/boeken/${slug}`} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-ink underline underline-offset-2">
        {url}
      </a>
      <button
        type="button"
        className={knopKlein}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(url)
            .then(() => setGekopieerd(true))
            .catch(() => setGekopieerd(false));
        }}
      >
        {gekopieerd ? "Gekopieerd" : "Kopieer link"}
      </button>
    </div>
  );
}

function NieuweAfspraak({ i, klaar }: { i: Instellingen; klaar: () => void }) {
  const [dienstId, setDienstId] = useState(i.diensten[0]?.id ?? "");
  const [medewerkerId, setMedewerkerId] = useState(i.medewerkers[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [naam, setNaam] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [email, setEmail] = useState("");
  const [opmerking, setOpmerking] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    setFout(null);
    const res = await fetch("/api/werkgever/afspraken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dienstId, medewerkerId, start, klant: { naam, telefoon, email }, opmerking }) });
    const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    setBezig(false);
    if (!res.ok) {
      setFout(d?.error?.message ?? "De afspraak kon niet worden gemaakt.");
      return;
    }
    klaar();
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className={`${kaart} space-y-3`} aria-label="Nieuwe afspraak">
      {fout && (
        <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
          {fout}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Dienst</span>
          <select value={dienstId} onChange={(e) => setDienstId(e.target.value)} className="field-input">
            {i.diensten.map((d) => (
              <option key={d.id} value={d.id}>
                {d.naam} ({d.duurMin} min)
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Medewerker</span>
          <select value={medewerkerId} onChange={(e) => setMedewerkerId(e.target.value)} className="field-input">
            {i.medewerkers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.naam}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Datum en tijd (Nederlandse tijd)</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">Naam van de klant</span>
          <input value={naam} onChange={(e) => setNaam(e.target.value)} required maxLength={80} className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">Telefoon (niet verplicht)</span>
          <input value={telefoon} onChange={(e) => setTelefoon(e.target.value)} inputMode="tel" className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">E-mail (niet verplicht)</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="field-input" />
        </label>
      </div>
      <label className="block">
        <span className="field-label">Opmerking</span>
        <input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} maxLength={300} className="field-input" />
      </label>
      <button type="submit" disabled={bezig} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
        {bezig ? "Bezig…" : "Afspraak maken"}
      </button>
    </form>
  );
}

// --- instellingen ------------------------------------------------------------

function InstellingenFormulier({ begin, nieuw, bewaard }: { begin: Instellingen; nieuw: boolean; bewaard: (i: Instellingen) => void }) {
  const [i, setI] = useState<Instellingen>(begin);
  const [prijzen, setPrijzen] = useState<string[]>(begin.diensten.map((d) => euroVeld(d.prijsCent)));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gelukt, setGelukt] = useState(false);

  const wijzig = (f: (x: Instellingen) => Instellingen) => {
    setI(f);
    setGelukt(false);
  };
  const vakken = (dag: number): Tijdvak[] => i.uren[dag] ?? [];
  const zetVakken = (dag: number, lijst: Tijdvak[]) => wijzig((x) => ({ ...x, uren: x.uren.map((v, n) => (n === dag ? lijst : v)) }));

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    const diensten = i.diensten.map((d, n) => ({ ...d, prijsCent: centUitVeld(prijzen[n] ?? "") }));
    if (diensten.some((d) => Number.isNaN(d.prijsCent))) {
      setFout("Een prijs klopt niet. Gebruik bijvoorbeeld 25,00 of laat hem leeg.");
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/werkgever/afspraken", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...i, diensten }) });
      const d = (await res.json().catch(() => null)) as { instellingen?: Instellingen; error?: { message?: string } } | null;
      if (!res.ok || !d?.instellingen) {
        setFout(d?.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw.");
        return;
      }
      setI(d.instellingen);
      setPrijzen(d.instellingen.diensten.map((x) => euroVeld(x.prijsCent)));
      bewaard(d.instellingen);
      setGelukt(true);
    } catch {
      setFout("Opslaan lukte niet. Controleer je verbinding.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className="space-y-6">
      {nieuw && (
        <p role="note" className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-ink">
          Stel hier je diensten, medewerkers en openingstijden in. Zet daarna de boekpagina open, dan kunnen klanten zelf een afspraak maken.
        </p>
      )}
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      {gelukt && (
        <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok">
          Opgeslagen.
        </p>
      )}

      <section className={`${kaart} space-y-3`}>
        <h2 className="font-display text-base font-bold text-ink">Je boekpagina</h2>
        <label className="block">
          <span className="field-label">Naam van je bedrijf</span>
          <input value={i.bedrijfsnaam} onChange={(e) => wijzig((x) => ({ ...x, bedrijfsnaam: e.target.value }))} required maxLength={80} className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">Adres van je boekpagina</span>
          <span className="flex items-center gap-1 text-sm text-neutralx-600">
            /boeken/
            <input value={i.slug} onChange={(e) => wijzig((x) => ({ ...x, slug: e.target.value.toLowerCase() }))} required maxLength={40} className="field-input" />
          </span>
          <span className="mt-1 block text-xs text-neutralx-500">Kleine letters, cijfers en streepjes. Dit adres geef je aan je klanten.</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={i.actief} onChange={(e) => wijzig((x) => ({ ...x, actief: e.target.checked }))} className="mt-1" />
          <span>De boekpagina staat open voor klanten</span>
        </label>
      </section>

      <section className={`${kaart} space-y-3`}>
        <h2 className="font-display text-base font-bold text-ink">Diensten</h2>
        {i.diensten.map((d, n) => (
          <div key={d.id || `nieuw-${n}`} className="grid grid-cols-[1fr_5.5rem_6rem_auto] items-end gap-2">
            <label className="block">
              <span className="field-label">Dienst</span>
              <input value={d.naam} onChange={(e) => wijzig((x) => ({ ...x, diensten: x.diensten.map((v, k) => (k === n ? { ...v, naam: e.target.value } : v)) }))} maxLength={60} className="field-input" />
            </label>
            <label className="block">
              <span className="field-label">Minuten</span>
              <input type="number" min={5} max={480} value={d.duurMin} onChange={(e) => wijzig((x) => ({ ...x, diensten: x.diensten.map((v, k) => (k === n ? { ...v, duurMin: Number(e.target.value) } : v)) }))} className="field-input" />
            </label>
            <label className="block">
              <span className="field-label">Prijs (€)</span>
              <input value={prijzen[n] ?? ""} inputMode="decimal" onChange={(e) => setPrijzen((p) => p.map((v, k) => (k === n ? e.target.value : v)))} className="field-input" />
            </label>
            <button
              type="button"
              className={knopKlein}
              disabled={i.diensten.length <= 1}
              onClick={() => {
                wijzig((x) => ({ ...x, diensten: x.diensten.filter((_, k) => k !== n) }));
                setPrijzen((p) => p.filter((_, k) => k !== n));
              }}
              aria-label={`Dienst ${d.naam || n + 1} weghalen`}
            >
              Weg
            </button>
          </div>
        ))}
        <button
          type="button"
          className={knopKlein}
          onClick={() => {
            wijzig((x) => ({ ...x, diensten: [...x.diensten, { id: "", naam: "", duurMin: 30, prijsCent: null }] }));
            setPrijzen((p) => [...p, ""]);
          }}
        >
          Dienst toevoegen
        </button>
      </section>

      <section className={`${kaart} space-y-3`}>
        <h2 className="font-display text-base font-bold text-ink">Medewerkers</h2>
        {i.medewerkers.map((m, n) => (
          <div key={m.id || n} className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="field-label">Naam</span>
              <input value={m.naam} onChange={(e) => wijzig((x) => ({ ...x, medewerkers: x.medewerkers.map((v, k) => (k === n ? { ...v, naam: e.target.value } : v)) }))} maxLength={60} className="field-input" />
            </label>
            <button type="button" className={knopKlein} disabled={i.medewerkers.length <= 1} onClick={() => wijzig((x) => ({ ...x, medewerkers: x.medewerkers.filter((_, k) => k !== n) }))} aria-label={`Medewerker ${m.naam || n + 1} weghalen`}>
              Weg
            </button>
          </div>
        ))}
        <button type="button" className={knopKlein} onClick={() => wijzig((x) => ({ ...x, medewerkers: [...x.medewerkers, { id: "", naam: "" }] }))}>
          Medewerker toevoegen
        </button>
      </section>

      <section className={`${kaart} space-y-3`}>
        <h2 className="font-display text-base font-bold text-ink">Wanneer kun je afspraken doen?</h2>
        {WEEK_VOLGORDE.map((dag) => (
          <div key={dag} className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm font-semibold capitalize text-ink">{WEEKDAG_NAAM[dag]}</span>
            {vakken(dag).length === 0 && <span className="text-sm text-neutralx-500">Gesloten</span>}
            {vakken(dag).map((v, n) => (
              <span key={n} className="flex items-center gap-1">
                <input type="time" value={v.van} onChange={(e) => zetVakken(dag, vakken(dag).map((w, k) => (k === n ? { ...w, van: e.target.value } : w)))} className="field-input w-28" aria-label={`${WEEKDAG_NAAM[dag]} van`} />
                –
                <input type="time" value={v.tot} onChange={(e) => zetVakken(dag, vakken(dag).map((w, k) => (k === n ? { ...w, tot: e.target.value } : w)))} className="field-input w-28" aria-label={`${WEEKDAG_NAAM[dag]} tot`} />
                <button type="button" className={knopKlein} onClick={() => zetVakken(dag, vakken(dag).filter((_, k) => k !== n))} aria-label={`Tijdvak op ${WEEKDAG_NAAM[dag]} weghalen`}>
                  Weg
                </button>
              </span>
            ))}
            {vakken(dag).length < 3 && (
              <button type="button" className={knopKlein} onClick={() => zetVakken(dag, [...vakken(dag), { van: "09:00", tot: "17:00" }])}>
                Tijdvak toevoegen
              </button>
            )}
          </div>
        ))}
      </section>

      <section className={`${kaart} grid gap-3 sm:grid-cols-3`}>
        <label className="block">
          <span className="field-label">Een afspraak kan beginnen om de</span>
          <select value={i.stapMin} onChange={(e) => wijzig((x) => ({ ...x, stapMin: Number(e.target.value) }))} className="field-input">
            {STAPPEN.map((s) => (
              <option key={s} value={s}>
                {s} minuten
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Minimaal van tevoren boeken</span>
          <select value={i.voorlopMin} onChange={(e) => wijzig((x) => ({ ...x, voorlopMin: Number(e.target.value) }))} className="field-input">
            {(VOORLOOP.includes(i.voorlopMin) ? VOORLOOP : [...VOORLOOP, i.voorlopMin].sort((a, b) => a - b)).map((v) => (
              <option key={v} value={v}>
                {voorloopTekst(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Hoeveel dagen vooruit</span>
          <input type="number" min={1} max={365} value={i.maxDagenVooruit} onChange={(e) => wijzig((x) => ({ ...x, maxDagenVooruit: Number(e.target.value) }))} className="field-input" />
        </label>
      </section>

      <button type="submit" disabled={bezig} className="btn-primary px-5 py-2.5 disabled:opacity-60">
        {bezig ? "Bezig…" : "Opslaan"}
      </button>
    </form>
  );
}
