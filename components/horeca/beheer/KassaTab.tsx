"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { bedragVeld, centVan, foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { euro } from "@/lib/horeca/weergave";
import { METHODE_LABEL, type Methode, type ZRapport } from "@/lib/horeca/kassa";
import { plusDagen } from "@/lib/horeca/reserveren";
import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";
import { BonVenster } from "@/components/horeca/live/Bon";
import type { BonData, BonKop } from "@/components/horeca/live/types";
import type { BeheerData, Doe } from "@/components/horeca/beheer/types";

// ---------------------------------------------------------------------------
// Tabblad Kassa: de dagafsluiting (Z-rapport) per dag — omzet per betaalwijze
// en per btw-tarief, fooi, de kas tellen tegenover wat er contant in de la
// hoort, alle bonnen (opnieuw te printen) en een CSV voor de boekhouder. Plus
// wat er op de bon staat (btw-nummer, voettekst).
// ---------------------------------------------------------------------------

const API = "/api/horeca/beheer";

interface Afsluiting {
  datum: string;
  rapport: ZRapport;
  bonnen: BonData[];
  kop: BonKop;
  telling: { geteldCent: number; door: string; op: string } | null;
}

const dagNaam = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export function KassaTab({ data, doe }: { data: BeheerData; doe: Doe }) {
  const vandaag = amsterdamDayKey(Date.now());
  const [datum, setDatum] = useState(vandaag);
  const [a, setA] = useState<Afsluiting | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [geteld, setGeteld] = useState("");
  const [bon, setBon] = useState<BonData | null>(null);
  const [van, setVan] = useState(plusDagen(vandaag, -30));
  const [tot, setTot] = useState(vandaag);
  const [inst, setInst] = useState({ btwNummer: data.kassa.btwNummer, voettekst: data.kassa.voettekst });

  const laad = useCallback(async () => {
    try {
      setA(await stuur<Afsluiting>(`${API}?alleen=kassa&datum=${datum}`));
      setFout(null);
    } catch (e) {
      setFout(foutVan(e));
    }
  }, [datum]);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function tel(e: FormEvent) {
    e.preventDefault();
    const cent = centVan(geteld);
    if (cent === null) return setFout("Vul het getelde bedrag in, bijvoorbeeld 245,50.");
    try {
      setA(await stuur<Afsluiting>(API, "POST", { actie: "kas-tellen", datum, geteldCent: cent }));
      setOk("De kastelling is bewaard.");
      setGeteld("");
    } catch (err) {
      setFout(foutVan(err));
    }
  }

  async function bewaarInst(e: FormEvent) {
    e.preventDefault();
    await doe({ actie: "kassa-instellingen", ...inst }, "De bon-gegevens zijn bewaard.");
  }

  const r = a?.rapport;
  const verschil = r && a?.telling ? a.telling.geteldCent - r.contantCent : null;

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center gap-3 p-5">
        <div className="mr-auto">
          <h2 className="font-display text-lg font-bold text-ink">Dagafsluiting</h2>
          <p className="text-sm capitalize text-neutralx-600">{dagNaam(datum)}</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setDatum((d) => plusDagen(d, -1))}>
          ← Vorige dag
        </button>
        <label className="sr-only" htmlFor="kassa-datum">
          Datum
        </label>
        <input id="kassa-datum" type="date" className="field-input w-auto" value={datum} max={vandaag} onChange={(e) => e.target.value && setDatum(e.target.value)} />
        <button type="button" className="btn-ghost" disabled={datum >= vandaag} onClick={() => setDatum((d) => plusDagen(d, 1))}>
          Volgende dag →
        </button>
        <a href="/scherm/kassa" target="_blank" rel="noopener" className="btn-primary">
          Open de kassa
        </a>
      </section>
      <Melding fout={fout} ok={ok} />

      {!r ? (
        <p className="text-sm text-neutralx-500">Laden…</p>
      ) : (
        <>
          <section aria-label="Totalen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { l: "Omzet (incl. btw)", w: euro(r.omzetCent), k: "text-money-ink" },
              { l: "Bonnen", w: String(r.bonnen), k: "text-ink" },
              { l: "Fooi", w: euro(r.fooiCent), k: "text-ink" },
              { l: "Contant in de la", w: euro(r.contantCent), k: "text-ink" },
            ].map((x) => (
              <div key={x.l} className="card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{x.l}</p>
                <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${x.k}`}>{x.w}</p>
              </div>
            ))}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card p-5" aria-labelledby="per-methode-kop">
              <h3 id="per-methode-kop" className="font-display text-base font-bold text-ink">
                Per betaalwijze
              </h3>
              {r.perMethode.length === 0 ? (
                <p className="mt-2 text-sm text-neutralx-500">Nog niets afgerekend op deze dag.</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-hair text-left text-neutralx-600">
                      <th scope="col" className="py-1 font-semibold">
                        Betaalwijze
                      </th>
                      <th scope="col" className="py-1 text-right font-semibold">
                        Bonnen
                      </th>
                      <th scope="col" className="py-1 text-right font-semibold">
                        Bedrag
                      </th>
                      <th scope="col" className="py-1 text-right font-semibold">
                        Fooi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.perMethode.map((m) => (
                      <tr key={m.methode} className="border-b border-hair">
                        <th scope="row" className="py-1.5 text-left font-normal text-ink">
                          {m.label}
                        </th>
                        <td className="py-1.5 text-right tabular-nums">{m.aantal}</td>
                        <td className="py-1.5 text-right tabular-nums">{euro(m.bedragCent)}</td>
                        <td className="py-1.5 text-right tabular-nums">{euro(m.fooiCent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card p-5" aria-labelledby="btw-kop">
              <h3 id="btw-kop" className="font-display text-base font-bold text-ink">
                Btw
              </h3>
              {r.btw.length === 0 ? (
                <p className="mt-2 text-sm text-neutralx-500">Geen omzet.</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-hair text-left text-neutralx-600">
                      <th scope="col" className="py-1 font-semibold">
                        Tarief
                      </th>
                      <th scope="col" className="py-1 text-right font-semibold">
                        Incl.
                      </th>
                      <th scope="col" className="py-1 text-right font-semibold">
                        Excl.
                      </th>
                      <th scope="col" className="py-1 text-right font-semibold">
                        Btw
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.btw.map((b) => (
                      <tr key={b.tarief} className="border-b border-hair">
                        <th scope="row" className="py-1.5 text-left font-normal text-ink">
                          {b.tarief} %
                        </th>
                        <td className="py-1.5 text-right tabular-nums">{euro(b.inclCent)}</td>
                        <td className="py-1.5 text-right tabular-nums">{euro(b.exclCent)}</td>
                        <td className="py-1.5 text-right tabular-nums">{euro(b.btwCent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <form onSubmit={(e) => void tel(e)} className="card space-y-3 p-5" aria-labelledby="kas-kop">
              <h3 id="kas-kop" className="font-display text-base font-bold text-ink">
                Kas tellen
              </h3>
              <p className="text-sm text-neutralx-600">
                Volgens de kassa hoort er <strong className="text-ink">{euro(r.contantCent)}</strong> contant in de la (betalingen plus contante fooi), naast je wisselgeld.
              </p>
              {a?.telling && verschil !== null && (
                <p role="status" className={`rounded-lg px-3 py-2 text-sm font-semibold ${verschil === 0 ? "pill-ok" : "bg-red-50 text-crit"}`}>
                  Geteld {euro(a.telling.geteldCent)} door {a.telling.door} om {amsterdamClock(a.telling.op)}: {verschil === 0 ? "klopt precies." : `verschil ${verschil > 0 ? "+" : "−"}${euro(Math.abs(verschil))}.`}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <Veld label="Geteld (zonder wisselgeld)">
                    <input className="field-input" inputMode="decimal" value={geteld} onChange={(e) => setGeteld(e.target.value)} placeholder={bedragVeld(r.contantCent)} />
                  </Veld>
                </div>
                <button type="submit" className="btn-primary">
                  Bewaar telling
                </button>
              </div>
            </form>

            <section className="card space-y-3 p-5" aria-labelledby="export-kop">
              <h3 id="export-kop" className="font-display text-base font-bold text-ink">
                Voor de boekhouder
              </h3>
              <p className="text-sm text-neutralx-600">Alle bonnen van een periode met betaalwijze, fooi en omzet per btw-tarief (CSV, opent in Excel).</p>
              <div className="flex flex-wrap items-end gap-3">
                <Veld label="Van">
                  <input type="date" className="field-input" value={van} max={tot} onChange={(e) => e.target.value && setVan(e.target.value)} />
                </Veld>
                <Veld label="Tot en met">
                  <input type="date" className="field-input" value={tot} min={van} max={vandaag} onChange={(e) => e.target.value && setTot(e.target.value)} />
                </Veld>
                <a className="btn-ghost" href={`${API}?alleen=kassa-csv&van=${van}&tot=${tot}`}>
                  Download CSV
                </a>
              </div>
            </section>
          </div>

          <section className="card p-5" aria-labelledby="bonnen-kop">
            <h3 id="bonnen-kop" className="font-display text-base font-bold text-ink">
              Bonnen van deze dag
            </h3>
            {a.bonnen.length === 0 ? (
              <p className="mt-2 text-sm text-neutralx-500">Geen bonnen.</p>
            ) : (
              <ul className="mt-2 divide-y divide-hair">
                {[...a.bonnen].reverse().map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="w-16 font-semibold tabular-nums text-ink">#{b.bonNummer}</span>
                    <span className="w-14 tabular-nums text-neutralx-600">{amsterdamClock(b.op)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {b.tafel ?? "Balie"} · {METHODE_LABEL[b.methode as Methode] ?? b.methode}
                      {b.door && <span className="text-neutralx-500"> · {b.door}</span>}
                    </span>
                    <span className="tabular-nums text-ink">
                      {euro(b.bedragCent)}
                      {b.fooiCent > 0 && <span className="text-neutralx-500"> + {euro(b.fooiCent)} fooi</span>}
                    </span>
                    <button type="button" className="text-sm font-semibold text-brand-600 hover:underline" onClick={() => setBon(b)}>
                      Bon<span className="sr-only"> {b.bonNummer}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <form onSubmit={(e) => void bewaarInst(e)} className="card space-y-4 p-5" aria-labelledby="bon-inst-kop">
        <h3 id="bon-inst-kop" className="font-display text-base font-bold text-ink">
          Op de bon
        </h3>
        <p className="text-sm text-neutralx-600">Naam, adres, telefoon en KVK komen uit Gegevens & openingstijden.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Veld label="Btw-nummer (mag leeg)">
            <input className="field-input" value={inst.btwNummer} onChange={(e) => setInst((x) => ({ ...x, btwNummer: e.target.value }))} maxLength={30} placeholder="NL123456789B01" />
          </Veld>
          <Veld label="Tekst onderaan de bon">
            <input className="field-input" value={inst.voettekst} onChange={(e) => setInst((x) => ({ ...x, voettekst: e.target.value }))} maxLength={300} />
          </Veld>
        </div>
        <button type="submit" className="btn-primary">
          Bewaren
        </button>
      </form>

      {bon && a && <BonVenster kop={a.kop} bonnen={[bon]} sluit={() => setBon(null)} />}
    </div>
  );
}
