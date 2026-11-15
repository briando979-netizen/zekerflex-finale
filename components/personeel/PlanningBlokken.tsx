"use client";

import { useCallback, useEffect, useState } from "react";
import { vulIn } from "@/lib/i18n/vul-in";
import { duurMinuten, euroTekst, urenTekst, werkMinuten, type Dienst, type Uur } from "@/lib/horeca-personeel/planning";
import type { MedewerkerPlanning, RuilMetDienst } from "@/lib/horeca-personeel/planning-view";
import type { PlanningTeksten } from "@/lib/horeca-personeel/planning-teksten";

// De planning op het dashboard van een medewerker (app/personeel): rooster met open diensten, aanbiedingen en niet-beschikbaar,
// verlof, en inklokken met de uren. Eén aanroep naar /api/personeel/planning, dat steeds de hele stand teruggeeft. De datum van
// vandaag komt van de server (Amsterdamse tijd), niet van de telefoon. Alle tekst komt van de server (planning-teksten.ts).

const API = "/api/personeel/planning";
const veld = "mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

export function PlanningBlokken({ t, taal, rooster, verlof, uren, fooi }: { t: PlanningTeksten; taal: string; rooster: boolean; verlof: boolean; uren: boolean; fooi: boolean }) {
  const [d, setD] = useState<MedewerkerPlanning | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [nietDatum, setNietDatum] = useState("");
  const [nietNotitie, setNietNotitie] = useState("");
  const [vVan, setVVan] = useState("");
  const [vTot, setVTot] = useState("");
  const [vReden, setVReden] = useState("");

  const dag = useCallback((s: string) => new Intl.DateTimeFormat(taal, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${s}T12:00:00Z`)), [taal]);

  const aanroep = useCallback(
    async (body?: unknown): Promise<boolean> => {
      setBezig(true);
      setFout(null);
      try {
        const res = await fetch(API, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = (await res.json().catch(() => ({}))) as MedewerkerPlanning & { error?: { message?: string } };
        if (!res.ok || !json.vandaag) throw new Error(json.error?.message ?? t.gemeen.fout);
        setD(json);
        return true;
      } catch (e) {
        setFout(e instanceof Error ? e.message : t.gemeen.fout);
        return false;
      } finally {
        setBezig(false);
      }
    },
    [t.gemeen.fout],
  );
  useEffect(() => {
    void aanroep();
  }, [aanroep]);

  if (!d) {
    return fout ? (
      <p role="alert" className="text-sm font-medium text-crit">
        {fout}
      </p>
    ) : (
      <p className="text-sm text-neutralx-500">{t.gemeen.bezig}</p>
    );
  }

  const tijd = (x: Dienst) => `${x.van}–${x.tot}`;
  const maand = d.vandaag.slice(0, 7);
  const maandMinuten = d.uren.filter((u: Uur) => u.datum.startsWith(maand)).reduce((s, u) => s + werkMinuten(u), 0);
  const regelRuil = (r: RuilMetDienst) => (
    <li key={r.ruil.id} className="flex flex-wrap items-center gap-3 py-2">
      <div className="min-w-0 flex-1 text-sm text-ink">
        {dag(r.dienst.datum)} {tijd(r.dienst)}
        <span className="ml-2 rounded-full bg-paper-soft px-2 py-0.5 text-xs font-semibold text-neutralx-600">{r.ruil.status === "geaccepteerd" ? t.rooster.wachtOp : t.status[r.ruil.status]}</span>
      </div>
      {(r.ruil.status === "aangeboden" || r.ruil.status === "geaccepteerd") && (
        <button type="button" className="min-h-[44px] text-sm font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void aanroep({ actie: "ruil-intrekken", ruilId: r.ruil.id })}>
          {t.rooster.intrekken}
        </button>
      )}
    </li>
  );

  return (
    <div className="space-y-8">
      {fout && (
        <p role="alert" className="text-sm font-medium text-crit">
          {fout}
        </p>
      )}

      {rooster && (
        <>
          <section aria-labelledby="pl-rooster" className="space-y-3">
            <h2 id="pl-rooster" className="font-display text-xl font-bold text-ink">
              {t.rooster.kop}
            </h2>
            {d.diensten.length === 0 ? (
              <p className="text-sm text-neutralx-500">{t.rooster.geenDiensten}</p>
            ) : (
              <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white">
                {d.diensten.map((x) => {
                  const lopend = d.mijnRuilen.some((r) => r.dienst.id === x.id && (r.ruil.status === "aangeboden" || r.ruil.status === "geaccepteerd"));
                  return (
                    <li key={x.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${x.datum < d.vandaag ? "opacity-60" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          {dag(x.datum)} · {tijd(x)} <span className="text-xs text-neutralx-500">({urenTekst(duurMinuten(x.van, x.tot))})</span>
                        </p>
                        {x.notitie && <p className="text-xs text-neutralx-500">{x.notitie}</p>}
                      </div>
                      {x.datum >= d.vandaag && !lopend && (
                        <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={bezig} onClick={() => void aanroep({ actie: "aanbieden", dienstId: x.id, naar: null })}>
                          {t.rooster.aanTeam}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {d.aanbiedingen.length > 0 && (
            <section aria-labelledby="pl-aanb" className="space-y-3">
              <h2 id="pl-aanb" className="font-display text-xl font-bold text-ink">
                {t.rooster.aanbiedingKop}
              </h2>
              <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white">
                {d.aanbiedingen.map((r) => (
                  <li key={r.ruil.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <p className="min-w-0 flex-1 text-sm text-ink">
                      {dag(r.dienst.datum)} · {tijd(r.dienst)} <span className="text-xs text-neutralx-500">{vulIn(t.rooster.van, { naam: r.vanNaam })}</span>
                    </p>
                    <button type="button" className="btn-primary min-h-[44px] text-sm" disabled={bezig} onClick={() => void aanroep({ actie: "aannemen", ruilId: r.ruil.id })}>
                      {t.rooster.neemAan}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="pl-open" className="space-y-3">
            <h2 id="pl-open" className="font-display text-xl font-bold text-ink">
              {t.rooster.openKop}
            </h2>
            {d.open.length === 0 ? (
              <p className="text-sm text-neutralx-500">{t.rooster.geenOpen}</p>
            ) : (
              <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white">
                {d.open.map((x) => {
                  const gemeld = d.mijnRuilen.some((r) => r.dienst.id === x.id && (r.ruil.status === "geaccepteerd" || r.ruil.status === "aangeboden"));
                  return (
                    <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <p className="min-w-0 flex-1 text-sm text-ink">
                        {dag(x.datum)} · {tijd(x)}
                        {x.notitie ? <span className="ml-2 text-xs text-neutralx-500">{x.notitie}</span> : null}
                      </p>
                      {gemeld ? (
                        <span className="text-xs font-semibold text-neutralx-600">{t.rooster.wachtOp}</span>
                      ) : (
                        <button type="button" className="btn-primary min-h-[44px] text-sm" disabled={bezig} onClick={() => void aanroep({ actie: "open-nemen", dienstId: x.id })}>
                          {t.rooster.neemOpen}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {d.mijnRuilen.length > 0 && (
            <section aria-labelledby="pl-ruil" className="space-y-3">
              <h2 id="pl-ruil" className="font-display text-xl font-bold text-ink">
                {t.rooster.ruilKop}
              </h2>
              <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white px-4">{d.mijnRuilen.map(regelRuil)}</ul>
            </section>
          )}

          <section aria-labelledby="pl-niet" className="space-y-3">
            <h2 id="pl-niet" className="font-display text-xl font-bold text-ink">
              {t.rooster.nietKop}
            </h2>
            <p className="text-sm text-neutralx-600">{t.rooster.nietUitleg}</p>
            {d.nietBeschikbaar.length === 0 ? (
              <p className="text-sm text-neutralx-500">{t.rooster.geenNiet}</p>
            ) : (
              <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white px-4">
                {d.nietBeschikbaar.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center gap-3 py-2">
                    <p className="min-w-0 flex-1 text-sm text-ink">
                      {dag(n.datum)}
                      {n.notitie ? <span className="ml-2 text-xs text-neutralx-500">{n.notitie}</span> : null}
                    </p>
                    <button type="button" className="min-h-[44px] text-sm font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void aanroep({ actie: "niet-beschikbaar-weg", id: n.id })}>
                      {t.gemeen.verwijder}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void aanroep({ actie: "niet-beschikbaar", datum: nietDatum, notitie: nietNotitie }).then((ok) => {
                  if (ok) {
                    setNietDatum("");
                    setNietNotitie("");
                  }
                });
              }}
            >
              <div>
                <label htmlFor="pl-nd" className="block text-sm font-medium text-ink">
                  {t.rooster.datum}
                </label>
                <input id="pl-nd" type="date" className={veld} required min={d.vandaag} value={nietDatum} onChange={(e) => setNietDatum(e.target.value)} />
              </div>
              <div>
                <label htmlFor="pl-nn" className="block text-sm font-medium text-ink">
                  {t.rooster.notitie}
                </label>
                <input id="pl-nn" className={veld} maxLength={300} value={nietNotitie} onChange={(e) => setNietNotitie(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="btn-primary min-h-[44px]" disabled={bezig || !nietDatum}>
                  {t.rooster.voeg}
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      {verlof && (
        <section aria-labelledby="pl-verlof" className="space-y-3">
          <h2 id="pl-verlof" className="font-display text-xl font-bold text-ink">
            {t.verlof.kop}
          </h2>
          <p className="text-sm text-neutralx-600">{t.verlof.uitleg}</p>
          {d.verlof.length === 0 ? (
            <p className="text-sm text-neutralx-500">{t.verlof.geen}</p>
          ) : (
            <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white px-4">
              {d.verlof.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 py-2">
                  <p className="min-w-0 flex-1 text-sm text-ink">
                    {vulIn(t.verlof.periode, { van: dag(v.van), tot: dag(v.tot) })}
                    <span className="ml-2 rounded-full bg-paper-soft px-2 py-0.5 text-xs font-semibold text-neutralx-600">{t.status[v.status]}</span>
                  </p>
                  {(v.status === "aangevraagd" || v.status === "goedgekeurd") && (
                    <button type="button" className="min-h-[44px] text-sm font-semibold text-crit hover:underline" disabled={bezig} onClick={() => void aanroep({ actie: "verlof-intrekken", id: v.id })}>
                      {t.verlof.intrekken}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void aanroep({ actie: "verlof-aanvragen", van: vVan, tot: vTot, reden: vReden }).then((ok) => {
                if (ok) {
                  setVVan("");
                  setVTot("");
                  setVReden("");
                }
              });
            }}
          >
            <div>
              <label htmlFor="pl-vv" className="block text-sm font-medium text-ink">
                {t.verlof.van}
              </label>
              <input id="pl-vv" type="date" className={veld} required min={d.vandaag} value={vVan} onChange={(e) => setVVan(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pl-vt" className="block text-sm font-medium text-ink">
                {t.verlof.tot}
              </label>
              <input id="pl-vt" type="date" className={veld} required min={vVan || d.vandaag} value={vTot} onChange={(e) => setVTot(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pl-vr" className="block text-sm font-medium text-ink">
                {t.verlof.reden}
              </label>
              <input id="pl-vr" className={veld} maxLength={300} value={vReden} onChange={(e) => setVReden(e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-primary min-h-[44px]" disabled={bezig || !vVan || !vTot}>
                {t.verlof.vraag}
              </button>
            </div>
          </form>
        </section>
      )}

      {fooi && (
        <section aria-labelledby="pl-fooi" className="space-y-3">
          <h2 id="pl-fooi" className="font-display text-xl font-bold text-ink">
            {t.fooi.kop}
          </h2>
          {d.fooien.length === 0 ? (
            <p className="text-sm text-neutralx-500">{t.fooi.geen}</p>
          ) : (
            <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white px-4">
              {d.fooien.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-ink">
                  <span>
                    {vulIn(t.fooi.periode, { van: dag(f.van), tot: dag(f.tot) })}
                    <span className="ml-2 text-xs text-neutralx-500">{vulIn(t.fooi.totaalPot, { bedrag: euroTekst(f.totaalCent) })}</span>
                  </span>
                  <span className="font-semibold">{vulIn(t.fooi.deel, { bedrag: euroTekst(f.cent) })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {uren && (
        <section aria-labelledby="pl-uren" className="space-y-3">
          <h2 id="pl-uren" className="font-display text-xl font-bold text-ink">
            {t.uren.kop}
          </h2>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hair bg-white p-4">
            <p className="min-w-0 flex-1 text-sm text-ink">{d.ingeklokt ? vulIn(t.uren.ingeklokt, { tijd: d.ingeklokt.in }) : t.uren.niet}</p>
            {d.ingeklokt ? (
              <button type="button" className="btn-primary min-h-[44px]" disabled={bezig} onClick={() => void aanroep({ actie: "klok-uit" })}>
                {t.uren.klokUit}
              </button>
            ) : (
              <button type="button" className="btn-primary min-h-[44px]" disabled={bezig} onClick={() => void aanroep({ actie: "klok-in" })}>
                {t.uren.klokIn}
              </button>
            )}
          </div>
          <p className="text-sm font-medium text-ink">{vulIn(t.uren.totaal, { uren: urenTekst(maandMinuten) })}</p>
          {d.uren.length === 0 ? (
            <p className="text-sm text-neutralx-500">{t.uren.geen}</p>
          ) : (
            <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white px-4">
              {d.uren.slice(0, 20).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm text-ink">
                  <span>
                    {dag(u.datum)} · {u.in}–{u.uit ?? t.uren.lopend}
                  </span>
                  <span className="text-xs text-neutralx-500">{u.uit ? urenTekst(werkMinuten(u)) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
