"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HERHALING_NAAM, MAX_TAKEN, WEEKDAG_NAAM, WEEK_VOLGORDE, herhalingTekst, plusDagen, type HerhalingSoort, type Overzicht, type OverzichtRij, type Sjabloon, type Uitvoering } from "@/lib/checklists/model";
import { ChecklistInvullen } from "@/components/checklists/ChecklistInvullen";

// Het checklistbeheer van een bedrijf: overzicht (wat gedaan en gemist is), de checklists zelf met hun invullink,
// de geschiedenis en de gegevens van uitvoerders. Alle tijden zijn Nederlandse tijd.

type SjabloonB = Omit<Sjabloon, "linkHash"> & { linkActief: boolean };

interface Lading {
  vandaag: string;
  van: string;
  tot: string;
  sjablonen: SjabloonB[];
  overzicht: Overzicht;
  uitvoeringen: Uitvoering[];
}

const klok = (iso: string) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const dagTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const dagLang = (dag: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${dag}T12:00:00Z`));

const kaart = "rounded-xl border border-hair bg-white p-4";
const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500";

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; fout: string }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const d = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!res.ok || !d) return { ok: false, fout: d?.error?.message ?? "Dat lukte niet. Vernieuw de pagina en probeer het opnieuw." };
    return { ok: true, data: d };
  } catch {
    return { ok: false, fout: "Geen verbinding. Controleer je internet en probeer het opnieuw." };
  }
}

const Fout = ({ tekst }: { tekst: string | null }) =>
  tekst ? (
    <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
      {tekst}
    </p>
  ) : null;

type Tab = "overzicht" | "checklists" | "geschiedenis" | "privacy";
const TABS: [Tab, string][] = [
  ["overzicht", "Overzicht"],
  ["checklists", "Checklists"],
  ["geschiedenis", "Geschiedenis"],
  ["privacy", "Gegevens van personeel"],
];

export function ChecklistsBeheer() {
  const [tab, setTab] = useState<Tab>("overzicht");
  const [lading, setLading] = useState<Lading | null>(null);
  const [lengte, setLengte] = useState(7);
  const [tot, setTot] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(async (totDag: string | null, dagen: number) => {
    const q = totDag ? `?van=${plusDagen(totDag, -(dagen - 1))}&tot=${totDag}` : "";
    const r = await api<Lading>(`/api/werkgever/checklists${q}`);
    if (!r.ok) {
      setFout(r.fout);
      return;
    }
    setFout(null);
    setLading(r.data);
    setTot(r.data.tot);
  }, []);

  useEffect(() => {
    void laad(null, 7);
  }, [laad]);

  if (!lading) return fout ? <Fout tekst={fout} /> : <p className="text-sm text-neutralx-500">Laden…</p>;
  const ververs = () => void laad(tot, lengte);

  return (
    <div>
      <div role="tablist" aria-label="Checklists" className="flex flex-wrap gap-1 border-b border-hair">
        {TABS.map(([t, naam]) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t ? "border-brand-600 text-ink" : "border-transparent text-neutralx-500 hover:text-ink"}`}>
            {naam}
          </button>
        ))}
      </div>
      {fout && (
        <div className="mt-3">
          <Fout tekst={fout} />
        </div>
      )}
      <div className="mt-5">
        {tab === "overzicht" && (
          <OverzichtTab
            lading={lading}
            lengte={lengte}
            wijzigPeriode={(t, l) => {
              setLengte(l);
              void laad(t, l);
            }}
            ververs={ververs}
          />
        )}
        {tab === "checklists" && <ChecklistsTab sjablonen={lading.sjablonen} ververs={ververs} />}
        {tab === "geschiedenis" && <GeschiedenisTab sjablonen={lading.sjablonen} vandaag={lading.vandaag} ververs={ververs} />}
        {tab === "privacy" && <PrivacyTab />}
      </div>
    </div>
  );
}

// --- uitvoering bekijken en corrigeren ----------------------------------------

function UitvoeringKaart({ u, sjabloon, ververs }: { u: Uitvoering; sjabloon: SjabloonB | undefined; ververs: () => void }) {
  const [open, setOpen] = useState(false);
  const [corrigeer, setCorrigeer] = useState(false);
  const nietGedaan = u.taken.filter((t) => !t.gedaan).length;
  return (
    <li className={kaart}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">
          {u.sjabloonNaam} · {u.uitvoerder}
        </span>
        <span className="text-xs text-neutralx-500">{dagTijd(u.tijdstip)}</span>
      </div>
      <p className={`mt-0.5 text-sm ${u.compleet ? "text-ok" : "text-crit"}`}>
        {u.compleet ? "Alles gedaan" : `${nietGedaan} van ${u.taken.length} taken niet gedaan`}
        {u.correctieVan ? " · correctie op een eerdere uitvoering" : ""}
        {u.bron === "beheer" ? " · door het bedrijf ingevuld" : ""}
      </p>
      <div className="mt-2 flex gap-1.5">
        <button type="button" className={knopKlein} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Verberg" : "Bekijk"}
        </button>
        {sjabloon?.actief && (
          <button type="button" className={knopKlein} onClick={() => setCorrigeer((c) => !c)}>
            {corrigeer ? "Sluiten" : "Corrigeren"}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-1.5 text-sm">
          {u.taken.map((t) => (
            <p key={t.id} className="text-neutralx-600">
              <span className={t.gedaan ? "font-semibold text-ok" : "font-semibold text-crit"}>{t.gedaan ? "Gedaan" : "Niet gedaan"}</span> · {t.tekst}
              {t.opmerking && <span className="text-xs text-neutralx-500"> — &ldquo;{t.opmerking}&rdquo;</span>}
            </p>
          ))}
          {u.notitie && <p className="text-neutralx-600">Notitie: &ldquo;{u.notitie}&rdquo;</p>}
          <p className="text-xs text-neutralx-500">Een uitvoering is onveranderlijk. Een vergissing los je op met een correctie: dat is een nieuwe uitvoering die hiernaar verwijst.</p>
        </div>
      )}
      {corrigeer && sjabloon && (
        <div className="mt-3 rounded-xl bg-paper-soft p-3">
          <p className="mb-2 text-sm font-semibold text-ink">Correctie: vul de checklist opnieuw in</p>
          <ChecklistInvullen
            eindpunt="/api/werkgever/checklists/uitvoeringen"
            taken={sjabloon.taken}
            extra={{ sjabloonId: sjabloon.id, correctieVan: u.id }}
            begin={{ antwoorden: Object.fromEntries(u.taken.map((t) => [t.id, t.gedaan])) }}
            onKlaar={() => {
              setCorrigeer(false);
              ververs();
            }}
          />
        </div>
      )}
    </li>
  );
}

// --- overzicht -----------------------------------------------------------------

const STATUS_TEKST: Record<OverzichtRij["status"], string> = { compleet: "Compleet", gemist: "Gemist", open: "Loopt nog", "nog-niet": "Nog niet aan de beurt" };
const STATUS_KLEUR: Record<OverzichtRij["status"], string> = { compleet: "bg-ok/10 text-ok", gemist: "bg-crit/10 text-crit", open: "bg-warn/10 text-warn", "nog-niet": "bg-paper-soft text-neutralx-600" };

function uiterlijkTekst(s: SjabloonB | undefined): string {
  const h = s?.herhaling;
  return h?.uiterlijk ? `uiterlijk ${h.uiterlijk}${h.volgendeDag ? " (na middernacht)" : ""}` : "de hele dag";
}

function OverzichtTab({ lading, lengte, wijzigPeriode, ververs }: { lading: Lading; lengte: number; wijzigPeriode: (tot: string, lengte: number) => void; ververs: () => void }) {
  const sj = useMemo(() => new Map(lading.sjablonen.map((s) => [s.id, s])), [lading.sjablonen]);
  const uitv = useMemo(() => new Map(lading.uitvoeringen.map((u) => [u.id, u])), [lading.uitvoeringen]);
  const [open, setOpen] = useState<string | null>(null);
  const perDag = useMemo(() => {
    const m = new Map<string, OverzichtRij[]>();
    for (const r of lading.overzicht.rijen) m.set(r.dag, [...(m.get(r.dag) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [lading.overzicht.rijen]);
  const gemist = lading.overzicht.gemist;
  const actief = lading.sjablonen.filter((s) => s.actief);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={knopKlein} onClick={() => wijzigPeriode(plusDagen(lading.tot, -lengte), lengte)}>
          ‹ Eerder
        </button>
        <button type="button" className={knopKlein} onClick={() => wijzigPeriode(lading.vandaag, lengte)}>
          Vandaag
        </button>
        <button type="button" className={knopKlein} onClick={() => wijzigPeriode(plusDagen(lading.tot, lengte), lengte)}>
          Later ›
        </button>
        <label className="flex items-center gap-1.5 text-sm text-neutralx-600">
          Periode
          <select value={lengte} onChange={(e) => wijzigPeriode(lading.tot, Number(e.target.value))} className="field-input py-1 text-sm">
            <option value={7}>7 dagen</option>
            <option value={14}>14 dagen</option>
            <option value={31}>31 dagen</option>
          </select>
        </label>
        <span className="text-sm text-neutralx-600">
          {dagLang(lading.van)} t/m {dagLang(lading.tot)}
        </span>
      </div>

      <p className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-600">Er worden geen meldingen verstuurd als er iets gemist is. Kijk hier, in dit overzicht, of een taak gedaan is.</p>

      <section aria-labelledby="gemist-kop">
        <h2 id="gemist-kop" className="text-sm font-bold text-ink">
          Gemist ({gemist.length})
        </h2>
        {gemist.length === 0 ? (
          <p className="mt-1 text-sm text-neutralx-500">{actief.some((s) => s.herhaling.soort !== "geen") ? "Niets gemist in deze periode." : "Stel bij een checklist een herhaling in, dan zie je hier wat gemist is."}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {gemist.map((r) => (
              <li key={`${r.dag}-${r.sjabloonId}`} className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
                <span className="font-semibold">{r.sjabloonNaam}</span>
                {r.locatie ? ` · ${r.locatie}` : ""} · {dagLang(r.dag)}, {uiterlijkTekst(sj.get(r.sjabloonId))}
                {r.uitgevoerd === "gedeeltelijk" ? " · wel gedeeltelijk gedaan" : ""}
                {r.teLaat ? " · later alsnog compleet gedaan" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dagen-kop" className="space-y-4">
        <h2 id="dagen-kop" className="text-sm font-bold text-ink">
          Per dag
        </h2>
        {perDag.length === 0 && <p className="text-sm text-neutralx-500">In deze periode werd niets verwacht.</p>}
        {perDag.map(([dag, rijen]) => (
          <div key={dag}>
            <h3 className={`text-sm font-bold ${dag === lading.vandaag ? "text-brand-700" : "text-ink"}`}>
              {dagLang(dag)}
              {dag === lading.vandaag ? " (vandaag)" : ""}
            </h3>
            <ul className="mt-2 space-y-2">
              {rijen.map((r) => {
                const u = r.uitvoeringId ? uitv.get(r.uitvoeringId) : undefined;
                const sleutel = `${r.dag}-${r.sjabloonId}`;
                return (
                  <li key={sleutel}>
                    {u ? (
                      <div>
                        <div className={`${kaart} flex flex-wrap items-center justify-between gap-2`}>
                          <span className="text-sm text-ink">
                            <span className="font-semibold">{r.sjabloonNaam}</span>
                            {r.locatie ? ` · ${r.locatie}` : ""} · {u.uitvoerder} om {klok(u.tijdstip)}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_KLEUR[r.status]}`}>{r.uitgevoerd === "gedeeltelijk" ? "Niet alles gedaan" : STATUS_TEKST[r.status]}</span>
                            <button type="button" className={knopKlein} onClick={() => setOpen(open === sleutel ? null : sleutel)} aria-expanded={open === sleutel}>
                              {open === sleutel ? "Verberg" : "Bekijk"}
                            </button>
                          </span>
                        </div>
                        {open === sleutel && (
                          <ul className="mt-2">
                            <UitvoeringKaart u={u} sjabloon={sj.get(u.sjabloonId)} ververs={ververs} />
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className={`${kaart} flex flex-wrap items-center justify-between gap-2`}>
                        <span className="text-sm text-ink">
                          <span className="font-semibold">{r.sjabloonNaam}</span>
                          {r.locatie ? ` · ${r.locatie}` : ""} · {uiterlijkTekst(sj.get(r.sjabloonId))}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_KLEUR[r.status]}`}>{STATUS_TEKST[r.status]}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

// --- checklists (sjablonen) -----------------------------------------------------

interface TaakVeld {
  id?: string;
  tekst: string;
  opmerkingVerplicht: boolean;
}

function ChecklistsTab({ sjablonen, ververs }: { sjablonen: SjabloonB[]; ververs: () => void }) {
  const [bewerk, setBewerk] = useState<SjabloonB | "nieuw" | null>(null);
  const [invullen, setInvullen] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [fout, setFout] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);

  async function maakLink(s: SjabloonB) {
    setFout(null);
    const r = await api<{ pad: string }>(`/api/werkgever/checklists/${s.id}/link`, { method: "POST" });
    if (!r.ok) return setFout(r.fout);
    setLinks((l) => ({ ...l, [s.id]: `${window.location.origin}${r.data.pad}` }));
    ververs();
  }
  async function trekIn(s: SjabloonB) {
    setFout(null);
    const r = await api<unknown>(`/api/werkgever/checklists/${s.id}/link`, { method: "DELETE" });
    if (!r.ok) return setFout(r.fout);
    setLinks((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== s.id)));
    ververs();
  }

  if (bewerk) {
    return (
      <SjabloonFormulier
        begin={bewerk === "nieuw" ? null : bewerk}
        klaar={() => {
          setBewerk(null);
          ververs();
        }}
        annuleer={() => setBewerk(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-neutralx-600">Een checklist is een lijst taken voor één plek, bijvoorbeeld &ldquo;Sluitronde keuken&rdquo; of &ldquo;Kamers 1e verdieping&rdquo;.</p>
        <button type="button" className="btn-primary shrink-0 px-3 py-2 text-sm" onClick={() => setBewerk("nieuw")}>
          Nieuwe checklist
        </button>
      </div>
      <Fout tekst={fout} />
      {sjablonen.length === 0 && <p className="text-sm text-neutralx-500">Je hebt nog geen checklists.</p>}
      <ul className="space-y-3">
        {sjablonen.map((s) => (
          <li key={s.id} className={`${kaart} ${s.actief ? "" : "opacity-70"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-base font-semibold text-ink">
                {s.naam}
                {s.actief ? "" : " (gearchiveerd)"}
              </span>
              <span className="text-xs text-neutralx-500">{s.taken.length} taken</span>
            </div>
            <p className="mt-0.5 text-sm text-neutralx-600">{[s.locatie, herhalingTekst(s.herhaling)].filter(Boolean).join(" · ")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" className={knopKlein} onClick={() => setBewerk(s)}>
                Bewerken
              </button>
              {s.actief && (
                <button type="button" className={knopKlein} onClick={() => setInvullen(invullen === s.id ? null : s.id)}>
                  {invullen === s.id ? "Sluiten" : "Zelf invullen"}
                </button>
              )}
              {s.actief && (
                <button type="button" className={knopKlein} onClick={() => void maakLink(s)}>
                  {s.linkActief ? "Nieuwe invullink" : "Invullink maken"}
                </button>
              )}
              {s.linkActief && (
                <button type="button" className={knopKlein} onClick={() => void trekIn(s)}>
                  Link intrekken
                </button>
              )}
            </div>
            {links[s.id] ? (
              <div className="mt-3 rounded-xl bg-paper-soft px-4 py-3 text-sm">
                <p className="text-neutralx-600">Stuur deze link naar je personeel. Je ziet hem alleen nu; een nieuwe link maakt de oude ongeldig.</p>
                <p className="mt-1 break-all font-semibold text-ink">{links[s.id]}</p>
                <button
                  type="button"
                  className={`${knopKlein} mt-2`}
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(links[s.id] ?? "")
                      .then(() => setGekopieerd(s.id))
                      .catch(() => setGekopieerd(null));
                  }}
                >
                  {gekopieerd === s.id ? "Gekopieerd" : "Kopieer link"}
                </button>
              </div>
            ) : s.linkActief ? (
              <p className="mt-2 text-xs text-neutralx-500">Er is een invullink. Om veilig te blijven is hij niet meer te zien; maak een nieuwe als je hem kwijt bent.</p>
            ) : null}
            {invullen === s.id && (
              <div className="mt-3 rounded-xl bg-paper-soft p-3">
                <ChecklistInvullen
                  eindpunt="/api/werkgever/checklists/uitvoeringen"
                  taken={s.taken}
                  extra={{ sjabloonId: s.id }}
                  onKlaar={() => {
                    setInvullen(null);
                    ververs();
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SjabloonFormulier({ begin, klaar, annuleer }: { begin: SjabloonB | null; klaar: () => void; annuleer: () => void }) {
  const [naam, setNaam] = useState(begin?.naam ?? "");
  const [locatie, setLocatie] = useState(begin?.locatie ?? "");
  const [taken, setTaken] = useState<TaakVeld[]>(begin?.taken.map((t) => ({ id: t.id, tekst: t.tekst, opmerkingVerplicht: t.opmerkingVerplicht })) ?? [{ tekst: "", opmerkingVerplicht: false }]);
  const [soort, setSoort] = useState<HerhalingSoort>(begin?.herhaling.soort ?? "geen");
  const [dagen, setDagen] = useState<number[]>(begin?.herhaling.dagen ?? [1]);
  const [uiterlijk, setUiterlijk] = useState(begin?.herhaling.uiterlijk ?? "");
  const [volgendeDag, setVolgendeDag] = useState(begin?.herhaling.volgendeDag ?? false);
  const [actief, setActief] = useState(begin?.actief ?? true);
  const [plak, setPlak] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const wijzig = (n: number, patch: Partial<TaakVeld>) => setTaken((t) => t.map((x, i) => (i === n ? { ...x, ...patch } : x)));
  const verschuif = (n: number, d: -1 | 1) =>
    setTaken((t) => {
      const m = n + d;
      if (m < 0 || m >= t.length) return t;
      const kopie = [...t];
      const a = kopie[n];
      const b = kopie[m];
      if (!a || !b) return t;
      kopie[n] = b;
      kopie[m] = a;
      return kopie;
    });

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    setFout(null);
    const r = await api<unknown>(begin ? `/api/werkgever/checklists/${begin.id}` : "/api/werkgever/checklists", {
      method: begin ? "PUT" : "POST",
      body: JSON.stringify({ naam, locatie, taken, actief, herhaling: { soort, dagen, uiterlijk: soort === "geen" ? null : uiterlijk, volgendeDag } }),
    });
    setBezig(false);
    if (!r.ok) return setFout(r.fout);
    klaar();
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className="space-y-4" noValidate>
      <h2 className="text-base font-bold text-ink">{begin ? "Checklist bewerken" : "Nieuwe checklist"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="cl-s-naam" className="field-label">
            Naam
          </label>
          <input id="cl-s-naam" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} className="field-input mt-1" />
        </div>
        <div>
          <label htmlFor="cl-s-loc" className="field-label">
            Locatie (mag leeg)
          </label>
          <input id="cl-s-loc" value={locatie} onChange={(e) => setLocatie(e.target.value)} maxLength={80} className="field-input mt-1" />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="field-label">
          Taken ({taken.filter((t) => t.tekst.trim()).length} van maximaal {MAX_TAKEN})
        </legend>
        <ol className="space-y-2">
          {taken.map((t, n) => (
            <li key={t.id ?? `nieuw-${n}`} className="rounded-xl border border-hair bg-white p-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor={`cl-t-${n}`} className="sr-only">
                  Taak {n + 1}
                </label>
                <input id={`cl-t-${n}`} value={t.tekst} onChange={(e) => wijzig(n, { tekst: e.target.value })} maxLength={160} placeholder={`Taak ${n + 1}`} className="field-input flex-1" />
                <button type="button" className={knopKlein} aria-label={`Taak ${n + 1} omhoog`} disabled={n === 0} onClick={() => verschuif(n, -1)}>
                  ↑
                </button>
                <button type="button" className={knopKlein} aria-label={`Taak ${n + 1} omlaag`} disabled={n === taken.length - 1} onClick={() => verschuif(n, 1)}>
                  ↓
                </button>
                <button type="button" className={knopKlein} aria-label={`Taak ${n + 1} weghalen`} onClick={() => setTaken((x) => x.filter((_, i) => i !== n))}>
                  Weg
                </button>
              </div>
              <label className="mt-1.5 flex items-center gap-2 text-xs text-neutralx-600">
                <input type="checkbox" checked={t.opmerkingVerplicht} onChange={(e) => wijzig(n, { opmerkingVerplicht: e.target.checked })} />
                Opmerking verplicht als deze taak niet gedaan is
              </label>
            </li>
          ))}
        </ol>
        <button type="button" className={knopKlein} disabled={taken.length >= MAX_TAKEN} onClick={() => setTaken((t) => [...t, { tekst: "", opmerkingVerplicht: false }])}>
          Taak toevoegen
        </button>
        <div>
          <label htmlFor="cl-plak" className="field-label">
            Meerdere taken tegelijk (één per regel)
          </label>
          <textarea id="cl-plak" value={plak} onChange={(e) => setPlak(e.target.value)} rows={3} className="field-input mt-1" />
          <button
            type="button"
            className={`${knopKlein} mt-1`}
            onClick={() => {
              const nieuw = plak.split("\n").map((r) => r.trim()).filter(Boolean).map((tekst) => ({ tekst, opmerkingVerplicht: false }));
              setTaken((t) => [...t.filter((x) => x.tekst.trim()), ...nieuw].slice(0, MAX_TAKEN));
              setPlak("");
            }}
          >
            Toevoegen aan de lijst
          </button>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="field-label">Herhaling</legend>
        <select aria-label="Herhaling" value={soort} onChange={(e) => setSoort(e.target.value as HerhalingSoort)} className="field-input">
          {(Object.keys(HERHALING_NAAM) as HerhalingSoort[]).map((k) => (
            <option key={k} value={k}>
              {HERHALING_NAAM[k]}
            </option>
          ))}
        </select>
        {soort === "weekdagen" && (
          <div className="flex flex-wrap gap-3">
            {WEEK_VOLGORDE.map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm text-ink">
                <input type="checkbox" checked={dagen.includes(d)} onChange={(e) => setDagen((x) => (e.target.checked ? [...x, d] : x.filter((y) => y !== d)))} />
                {WEKDAG_KORT[d]}
              </label>
            ))}
          </div>
        )}
        {soort !== "geen" && (
          <div className="space-y-1.5">
            <label htmlFor="cl-s-tijd" className="field-label">
              Uiterlijk om (Nederlandse tijd, mag leeg: dan de hele dag)
            </label>
            <input id="cl-s-tijd" type="time" value={uiterlijk} onChange={(e) => setUiterlijk(e.target.value)} className="field-input w-40" />
            {uiterlijk && (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={volgendeDag} onChange={(e) => setVolgendeDag(e.target.checked)} />
                Dit tijdstip valt na middernacht, op de dag erna (bijvoorbeeld een sluitronde tot 02:00)
              </label>
            )}
          </div>
        )}
        <p className="text-xs text-neutralx-500">&ldquo;Gemist&rdquo; betekent: de tijd is voorbij en de checklist is dan niet helemaal ingevuld. Er worden geen meldingen verstuurd.</p>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={actief} onChange={(e) => setActief(e.target.checked)} />
        Actief (haal het vinkje weg om de checklist te archiveren; de invullink werkt dan niet meer)
      </label>

      <Fout tekst={fout} />
      <div className="flex gap-2">
        <button type="submit" disabled={bezig} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
          {bezig ? "Bewaren…" : "Bewaren"}
        </button>
        <button type="button" className={knopKlein} onClick={annuleer}>
          Annuleren
        </button>
      </div>
    </form>
  );
}

const WEKDAG_KORT: Record<number, string> = Object.fromEntries(WEEKDAG_NAAM.map((n, i) => [i, n]));

// --- geschiedenis -----------------------------------------------------------------

function GeschiedenisTab({ sjablonen, vandaag, ververs }: { sjablonen: SjabloonB[]; vandaag: string; ververs: () => void }) {
  const [sjabloonId, setSjabloonId] = useState("");
  const [tot, setTot] = useState(vandaag);
  const [lijst, setLijst] = useState<Uitvoering[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const sj = useMemo(() => new Map(sjablonen.map((s) => [s.id, s])), [sjablonen]);

  const laad = useCallback(async () => {
    setLijst(null);
    const r = await api<{ uitvoeringen: Uitvoering[] }>(`/api/werkgever/checklists/uitvoeringen?tot=${tot}${sjabloonId ? `&sjabloon=${sjabloonId}` : ""}`);
    if (!r.ok) return setFout(r.fout);
    setFout(null);
    setLijst(r.data.uitvoeringen);
  }, [tot, sjabloonId]);

  useEffect(() => {
    void laad();
  }, [laad]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-neutralx-600">
          Checklist
          <select value={sjabloonId} onChange={(e) => setSjabloonId(e.target.value)} className="field-input py-1 text-sm">
            <option value="">Alle checklists</option>
            {sjablonen.map((s) => (
              <option key={s.id} value={s.id}>
                {s.naam}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm text-neutralx-600">
          {dagLang(plusDagen(tot, -30))} t/m {dagLang(tot)}
        </span>
        <button type="button" className={knopKlein} onClick={() => setTot(plusDagen(tot, -31))}>
          ‹ Eerdere 31 dagen
        </button>
        <button type="button" className={knopKlein} disabled={tot >= vandaag} onClick={() => setTot(plusDagen(tot, 31) > vandaag ? vandaag : plusDagen(tot, 31))}>
          Latere 31 dagen ›
        </button>
      </div>
      <Fout tekst={fout} />
      {lijst === null ? (
        <p className="text-sm text-neutralx-500">Laden…</p>
      ) : lijst.length === 0 ? (
        <p className="text-sm text-neutralx-500">Geen uitvoeringen in deze periode.</p>
      ) : (
        <ul className="space-y-3">
          {lijst.map((u) => (
            <UitvoeringKaart key={u.id} u={u} sjabloon={sj.get(u.sjabloonId)} ververs={() => { void laad(); ververs(); }} />
          ))}
        </ul>
      )}
    </div>
  );
}

// --- gegevens van personeel ---------------------------------------------------------

function PrivacyTab() {
  const [namen, setNamen] = useState<{ naam: string; aantal: number }[] | null>(null);
  const [zeker, setZeker] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string | null>(null);

  const laad = useCallback(async () => {
    const r = await api<{ uitvoerders: { naam: string; aantal: number }[] }>("/api/werkgever/checklists/uitvoerders");
    if (!r.ok) return setFout(r.fout);
    setNamen(r.data.uitvoerders);
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  async function wis(naam: string) {
    setFout(null);
    const r = await api<{ gewist: number }>("/api/werkgever/checklists/uitvoerders", { method: "DELETE", body: JSON.stringify({ naam }) });
    setZeker(null);
    if (!r.ok) return setFout(r.fout);
    setBericht(`Gewist: de naam is in ${r.data.gewist} uitvoeringen vervangen door "Verwijderd".`);
    void laad();
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-neutralx-600">
        De namen van wie een checklist invult zijn persoonsgegevens. Op verzoek van een medewerker wis je zijn naam hier: in alle uitvoeringen wordt de naam &ldquo;Verwijderd&rdquo;, de uitvoeringen zelf blijven (zodat je overzicht klopt). Een vrije notitie of opmerking
        die iemand zelf typte, blijft staan; lees die na. Bewaar uitvoeringen niet langer dan 2 jaar; oudere worden nog niet vanzelf gewist.
      </p>
      <Fout tekst={fout} />
      {bericht && (
        <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok">
          {bericht}
        </p>
      )}
      {namen === null ? (
        <p className="text-sm text-neutralx-500">Laden…</p>
      ) : namen.length === 0 ? (
        <p className="text-sm text-neutralx-500">Er staan geen namen in de uitvoeringen.</p>
      ) : (
        <ul className="space-y-2">
          {namen.map((n) => (
            <li key={n.naam} className={`${kaart} flex flex-wrap items-center justify-between gap-2`}>
              <span className="text-sm text-ink">
                <span className="font-semibold">{n.naam}</span> · {n.aantal} {n.aantal === 1 ? "uitvoering" : "uitvoeringen"}
              </span>
              {zeker === n.naam ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-crit">Zeker weten? Dit kan niet terug.</span>
                  <button type="button" className={knopKlein} onClick={() => void wis(n.naam)}>
                    Ja, wissen
                  </button>
                  <button type="button" className={knopKlein} onClick={() => setZeker(null)}>
                    Nee
                  </button>
                </span>
              ) : (
                <button type="button" className={knopKlein} onClick={() => setZeker(n.naam)}>
                  Gegevens wissen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
