"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { vulIn } from "@/lib/i18n/vul-in";
import {
  plusDagen,
  urenPerMedewerker,
  urenTekst,
  weekDagen,
  weekMinuten,
  weekStart,
  werkMinuten,
  type Dienst,
  type PlanWaarschuwing,
  type Planning,
} from "@/lib/horeca-personeel/planning";
import type { Medewerker } from "@/lib/horeca-personeel/model";
import type { PlanningTeksten } from "@/lib/horeca-personeel/planning-teksten";

// De planning van het personeel in het horeca-beheer: het rooster per week (met kopiëren naar volgende week), ruilverzoeken en
// verlofaanvragen om goed te keuren, en de gewerkte uren met een csv voor de loonadministratie. Eén aanroep naar
// /api/horeca/personeel/planning, dat steeds de hele planning teruggeeft. Alle tekst komt van de server (planning-teksten.ts).

const API = "/api/horeca/personeel/planning";
const veld = "mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

interface Stand {
  planning: Planning;
  medewerkers: Medewerker[];
  vandaag: string;
}

interface Invoer {
  id?: string;
  medewerkerId: string; // "" = open dienst
  datum: string;
  van: string;
  tot: string;
  notitie: string;
}

export function PlanningBeheer({ t, taal }: { t: PlanningTeksten; taal: string }) {
  const b = t.beheer;
  const [stand, setStand] = useState<Stand | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [invoer, setInvoer] = useState<Invoer | null>(null);
  const [maand, setMaand] = useState<string | null>(null);
  const [uur, setUur] = useState({ medewerkerId: "", datum: "", in: "", uit: "" });

  const dag = useCallback((s: string) => new Intl.DateTimeFormat(taal, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${s}T12:00:00Z`)), [taal]);

  const aanroep = useCallback(
    async (body?: unknown): Promise<{ aantal?: number; waarschuwingen?: PlanWaarschuwing[] } | null> => {
      setBezig(true);
      setFout(null);
      try {
        const res = await fetch(API, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = (await res.json().catch(() => ({}))) as { planning?: Planning; medewerkers?: Medewerker[]; vandaag?: string; aantal?: number; waarschuwingen?: PlanWaarschuwing[]; error?: { message?: string } };
        if (!res.ok || !json.planning) throw new Error(json.error?.message ?? t.gemeen.fout);
        const planning = json.planning;
        setStand((s) => ({ planning, medewerkers: json.medewerkers ?? s?.medewerkers ?? [], vandaag: json.vandaag ?? s?.vandaag ?? "" }));
        return { ...(json.aantal !== undefined ? { aantal: json.aantal } : {}), ...(json.waarschuwingen ? { waarschuwingen: json.waarschuwingen } : {}) };
      } catch (e) {
        setFout(e instanceof Error ? e.message : t.gemeen.fout);
        return null;
      } finally {
        setBezig(false);
      }
    },
    [t.gemeen.fout],
  );
  useEffect(() => {
    void aanroep();
  }, [aanroep]);
  useEffect(() => {
    if (stand && start === null) {
      setStart(weekStart(stand.vandaag));
      setMaand(stand.vandaag.slice(0, 7));
    }
  }, [stand, start]);

  const naamVan = useCallback((id: string | null) => (id ? stand?.medewerkers.find((m) => m.id === id)?.naam ?? "?" : b.open), [stand, b.open]);
  const actief = useMemo(() => stand?.medewerkers.filter((m) => m.status === "actief") ?? [], [stand]);

  if (!stand || start === null || maand === null) {
    return fout ? (
      <p role="alert" className="text-sm font-medium text-crit">
        {fout}
      </p>
    ) : (
      <p className="text-sm text-neutralx-500">{t.gemeen.bezig}</p>
    );
  }
  const p = stand.planning;
  const dagen = weekDagen(start);
  const tijd = (x: Pick<Dienst, "van" | "tot">) => `${x.van}–${x.tot}`;
  const melden = (w: PlanWaarschuwing[] | undefined) => setMelding(w && w.length > 0 ? w.map((x) => t.waarschuwing[x]).join(" ") : null);

  async function plan() {
    if (!invoer) return;
    const body = { medewerkerId: invoer.medewerkerId || null, datum: invoer.datum, van: invoer.van, tot: invoer.tot, notitie: invoer.notitie };
    const r = await aanroep(invoer.id ? { actie: "dienst-wijzig", id: invoer.id, ...body } : { actie: "dienst", ...body });
    if (r) {
      melden(r.waarschuwingen);
      setInvoer(null);
    }
  }

  const wachtendeRuilen = p.ruilen.filter((r) => r.status === "geaccepteerd" && r.naar !== null);
  const wachtendVerlof = p.verlof.filter((v) => v.status === "aangevraagd");
  const perMedewerker = urenPerMedewerker(p, maand);
  const urenRegels = p.uren.filter((u) => u.datum.startsWith(maand)).sort((a, c) => (a.datum + a.in < c.datum + c.in ? 1 : -1));

  return (
    <div className="space-y-8">
      <h3 className="font-display text-lg font-bold text-ink">{b.kop}</h3>
      {fout && (
        <p role="alert" className="text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      {melding && (
        <p role="status" className="text-sm font-medium text-ink">
          {melding}
        </p>
      )}

      {/* rooster */}
      <section aria-labelledby="plb-rooster" className="rounded-2xl border border-hair bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h4 id="plb-rooster" className="mr-auto font-semibold text-ink">
            {vulIn(b.weekVan, { datum: dag(start) })}
          </h4>
          <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => setStart(plusDagen(start, -7))}>
            {b.vorige}
          </button>
          <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => setStart(weekStart(stand.vandaag))}>
            {b.dezeWeek}
          </button>
          <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => setStart(plusDagen(start, 7))}>
            {b.volgende}
          </button>
        </div>

        <ul className="mt-3 divide-y divide-hair">
          {dagen.map((dg) => {
            const diensten = p.diensten.filter((x) => x.datum === dg).sort((a, c) => (a.van < c.van ? -1 : 1));
            return (
              <li key={dg} className="py-2">
                <div className="flex flex-wrap items-start gap-3">
                  <p className={`w-24 shrink-0 text-sm font-semibold ${dg === stand.vandaag ? "text-brand-600" : "text-ink"}`}>{dag(dg)}</p>
                  <div className="min-w-0 flex-1 space-y-1">
                    {diensten.length === 0 && <p className="text-xs text-neutralx-500">–</p>}
                    {diensten.map((x) => (
                      <div key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={`rounded-lg px-2 py-1 ${x.medewerkerId ? "bg-paper-soft text-ink" : "border border-dashed border-hairstrong text-neutralx-600"}`}>
                          {naamVan(x.medewerkerId)} · {tijd(x)}
                          {x.notitie ? ` · ${x.notitie}` : ""}
                        </span>
                        <button type="button" className="min-h-[44px] text-xs font-semibold text-brand-600 hover:underline" onClick={() => setInvoer({ id: x.id, medewerkerId: x.medewerkerId ?? "", datum: x.datum, van: x.van, tot: x.tot, notitie: x.notitie })}>
                          {b.wijzig}
                        </button>
                        <button type="button" className="min-h-[44px] text-xs font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void aanroep({ actie: "dienst-weg", id: x.id })}>
                          {t.gemeen.verwijder}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {actief.length > 0 && (
          <p className="mt-3 text-xs text-neutralx-500">
            {actief.map((m) => `${m.naam}: ${vulIn(b.uren, { uren: urenTekst(weekMinuten(p, m.id, start)) })}`).join(" · ")}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary min-h-[44px]" onClick={() => setInvoer({ medewerkerId: actief[0]?.id ?? "", datum: start, van: "09:00", tot: "17:00", notitie: "" })}>
            {b.toevoegenKop}
          </button>
          <button
            type="button"
            className="btn-ghost min-h-[44px] text-sm"
            disabled={bezig}
            onClick={() =>
              void aanroep({ actie: "kopieer-week", van: start, naar: plusDagen(start, 7) }).then((r) => {
                if (r) setMelding(vulIn(b.gekopieerd, { n: r.aantal ?? 0 }));
              })
            }
          >
            {b.kopieer}
          </button>
        </div>

        {invoer && (
          <form
            className="mt-4 grid gap-3 rounded-xl border border-hair p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void plan();
            }}
          >
            <div>
              <label htmlFor="plb-m" className="block text-sm font-medium text-ink">
                {b.medewerker}
              </label>
              <select id="plb-m" className={veld} value={invoer.medewerkerId} onChange={(e) => setInvoer({ ...invoer, medewerkerId: e.target.value })}>
                <option value="">{b.open}</option>
                {actief.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.naam}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="plb-d" className="block text-sm font-medium text-ink">
                {b.datum}
              </label>
              <input id="plb-d" type="date" className={veld} required value={invoer.datum} onChange={(e) => setInvoer({ ...invoer, datum: e.target.value })} />
            </div>
            <div>
              <label htmlFor="plb-v" className="block text-sm font-medium text-ink">
                {b.van}
              </label>
              <input id="plb-v" type="time" className={veld} required value={invoer.van} onChange={(e) => setInvoer({ ...invoer, van: e.target.value })} />
            </div>
            <div>
              <label htmlFor="plb-t" className="block text-sm font-medium text-ink">
                {b.tot}
              </label>
              <input id="plb-t" type="time" className={veld} required value={invoer.tot} onChange={(e) => setInvoer({ ...invoer, tot: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="plb-n" className="block text-sm font-medium text-ink">
                {b.notitie}
              </label>
              <input id="plb-n" className={veld} maxLength={300} value={invoer.notitie} onChange={(e) => setInvoer({ ...invoer, notitie: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" className="btn-primary min-h-[44px]" disabled={bezig}>
                {bezig ? t.gemeen.bezig : invoer.id ? t.gemeen.bewaar : b.plaats}
              </button>
              <button type="button" className="btn-ghost min-h-[44px]" onClick={() => setInvoer(null)}>
                {t.gemeen.annuleer}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ruilverzoeken */}
      <section aria-labelledby="plb-ruil" className="rounded-2xl border border-hair bg-white p-5">
        <h4 id="plb-ruil" className="font-semibold text-ink">
          {b.ruilKop}
        </h4>
        {wachtendeRuilen.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-500">{b.geenRuilen}</p>
        ) : (
          <ul className="mt-2 divide-y divide-hair">
            {wachtendeRuilen.map((r) => {
              const dienst = p.diensten.find((x) => x.id === r.dienstId);
              if (!dienst) return null;
              const tekst = r.van === null ? vulIn(b.ruilOpenTekst, { naam: naamVan(r.naar), naar: naamVan(r.naar), datum: dag(dienst.datum), tijd: tijd(dienst) }) : vulIn(b.ruilTekst, { van: naamVan(r.van), naar: naamVan(r.naar), datum: dag(dienst.datum), tijd: tijd(dienst) });
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                  <p className="min-w-0 flex-1 text-sm text-ink">{tekst}</p>
                  <button type="button" className="btn-primary min-h-[44px] text-sm" disabled={bezig} onClick={() => void aanroep({ actie: "ruil", id: r.id, besluit: "goedkeuren" }).then((x) => x && melden(x.waarschuwingen))}>
                    {b.goedkeuren}
                  </button>
                  <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={bezig} onClick={() => void aanroep({ actie: "ruil", id: r.id, besluit: "afwijzen" })}>
                    {b.afwijzen}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* verlof */}
      <section aria-labelledby="plb-verlof" className="rounded-2xl border border-hair bg-white p-5">
        <h4 id="plb-verlof" className="font-semibold text-ink">
          {b.verlofKop}
        </h4>
        {wachtendVerlof.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-500">{b.geenVerlof}</p>
        ) : (
          <ul className="mt-2 divide-y divide-hair">
            {wachtendVerlof.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
                <p className="min-w-0 flex-1 text-sm text-ink">
                  {vulIn(b.verlofTekst, { naam: naamVan(v.medewerkerId), van: dag(v.van), tot: dag(v.tot) })}
                  {v.reden ? <span className="ml-2 text-xs text-neutralx-500">{v.reden}</span> : null}
                </p>
                <button type="button" className="btn-primary min-h-[44px] text-sm" disabled={bezig} onClick={() => void aanroep({ actie: "verlof", id: v.id, besluit: "goedkeuren" })}>
                  {b.goedkeuren}
                </button>
                <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={bezig} onClick={() => void aanroep({ actie: "verlof", id: v.id, besluit: "afwijzen" })}>
                  {b.afwijzen}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* uren */}
      <section aria-labelledby="plb-uren" className="rounded-2xl border border-hair bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <h4 id="plb-uren" className="mr-auto font-semibold text-ink">
            {b.urenKop}
          </h4>
          <div>
            <label htmlFor="plb-maand" className="block text-sm font-medium text-ink">
              {b.maand}
            </label>
            <input id="plb-maand" type="month" className={veld} value={maand} onChange={(e) => e.target.value && setMaand(e.target.value)} />
          </div>
          <a href={`${API}?uren=${encodeURIComponent(maand)}`} className="btn-ghost inline-flex min-h-[44px] items-center text-sm">
            {b.exportCsv}
          </a>
        </div>
        {urenRegels.length === 0 ? (
          <p className="mt-3 text-sm text-neutralx-500">{b.geenUren}</p>
        ) : (
          <>
            <p className="mt-3 text-sm font-medium text-ink">{b.totaalKop}</p>
            <p className="text-sm text-neutralx-600">{[...perMedewerker].map(([id, min]) => `${naamVan(id)}: ${urenTekst(min)}`).join(" · ") || "–"}</p>
            <ul className="mt-3 divide-y divide-hair">
              {urenRegels.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 py-2 text-sm text-ink">
                  <span className="min-w-0 flex-1">
                    {naamVan(u.medewerkerId)} · {dag(u.datum)} · {u.in}–{u.uit ?? b.nogIngeklokt}
                    {u.uit ? <span className="ml-2 text-xs text-neutralx-500">{urenTekst(werkMinuten(u))}</span> : null}
                  </span>
                  <button type="button" className="min-h-[44px] text-xs font-semibold text-brand-600 hover:underline" onClick={() => setUur({ medewerkerId: u.medewerkerId, datum: u.datum, in: u.in, uit: u.uit ?? "" })}>
                    {b.wijzig}
                  </button>
                  <button type="button" className="min-h-[44px] text-xs font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void aanroep({ actie: "uur-weg", id: u.id })}>
                    {t.gemeen.verwijder}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <form
          className="mt-4 grid gap-3 rounded-xl border border-hair p-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const bestaand = urenRegels.find((u) => u.medewerkerId === uur.medewerkerId && u.datum === uur.datum && u.in === uur.in);
            void aanroep({ actie: "uur", ...(bestaand ? { id: bestaand.id } : {}), medewerkerId: uur.medewerkerId, datum: uur.datum, in: uur.in, uit: uur.uit || null }).then((r) => {
              if (r) setUur({ medewerkerId: uur.medewerkerId, datum: "", in: "", uit: "" });
            });
          }}
        >
          <p className="text-sm font-semibold text-ink sm:col-span-4">{b.uurToevoegen}</p>
          <div>
            <label htmlFor="plb-um" className="block text-sm font-medium text-ink">
              {b.medewerker}
            </label>
            <select id="plb-um" className={veld} required value={uur.medewerkerId} onChange={(e) => setUur({ ...uur, medewerkerId: e.target.value })}>
              <option value="" />
              {stand.medewerkers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.naam}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="plb-ud" className="block text-sm font-medium text-ink">
              {b.datum}
            </label>
            <input id="plb-ud" type="date" className={veld} required value={uur.datum} onChange={(e) => setUur({ ...uur, datum: e.target.value })} />
          </div>
          <div>
            <label htmlFor="plb-ui" className="block text-sm font-medium text-ink">
              {b.uurIn}
            </label>
            <input id="plb-ui" type="time" className={veld} required value={uur.in} onChange={(e) => setUur({ ...uur, in: e.target.value })} />
          </div>
          <div>
            <label htmlFor="plb-uu" className="block text-sm font-medium text-ink">
              {b.uurUit}
            </label>
            <input id="plb-uu" type="time" className={veld} value={uur.uit} onChange={(e) => setUur({ ...uur, uit: e.target.value })} />
          </div>
          <div className="sm:col-span-4">
            <button type="submit" className="btn-primary min-h-[44px]" disabled={bezig}>
              {t.gemeen.bewaar}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
