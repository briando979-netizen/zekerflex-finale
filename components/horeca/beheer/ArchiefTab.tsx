"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { ARCHIEF_BRONNEN, ARCHIEF_SOORTEN, type ArchiefRij, type Samenvatting } from "@/lib/horeca/archief";
import { teBetalenCent } from "@/lib/horeca/bezorgen";
import { euro } from "@/lib/horeca/weergave";
import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";
import type { BeheerData } from "@/components/horeca/beheer/types";

// Het archief van de bestellingen (horeca, 15 nov 2026): periode, soort, kanaal, betaling, bezorger en zoeken, met
// het aantal, de rijen en op verzoek de omzet en btw per tarief; ook als CSV. Tekst in lib/i18n (horecaArchief).

const API = "/api/horeca/beheer";
const dagTerug = (dagen: number) => amsterdamDayKey(new Date(Date.now() - dagen * 86_400_000));

interface Antwoord {
  rijen: ArchiefRij[];
  meer: boolean;
  samenvatting: Samenvatting;
}

export function ArchiefTab({ data }: { data: BeheerData }) {
  const t = useT().horecaArchief;
  // de datums pas in de browser (Nederlandse tijd), anders verschilt de eerste weergave met de server
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [soorten, setSoorten] = useState<string[]>([...ARCHIEF_SOORTEN]);
  const [bronnen, setBronnen] = useState<string[]>([...ARCHIEF_BRONNEN]);
  const [betaald, setBetaald] = useState<"alle" | "ja" | "nee">("alle");
  const [geannuleerd, setGeannuleerd] = useState(false);
  const [bezorger, setBezorger] = useState("");
  const [zoek, setZoek] = useState("");
  const [uit, setUit] = useState<Antwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [omzet, setOmzet] = useState(false);

  const query = useCallback(
    (v: string, tt: string) =>
      new URLSearchParams({ van: v, tot: tt, soort: soorten.join(","), bron: bronnen.join(","), betaald, geannuleerd: geannuleerd ? "1" : "0", bezorger, q: zoek }).toString(),
    [soorten, bronnen, betaald, geannuleerd, bezorger, zoek],
  );

  const zoekNu = useCallback(
    async (v: string, tt: string) => {
      try {
        setUit(await stuur<Antwoord>(`${API}?alleen=archief&${query(v, tt)}`));
        setFout(null);
      } catch (e) {
        setFout(foutVan(e));
      }
    },
    [query],
  );

  // bij het openen: de laatste 7 dagen, alles; daarna zoekt de knop
  useEffect(() => {
    const v = dagTerug(6);
    const tt = dagTerug(0);
    setVan(v);
    setTot(tt);
    stuur<Antwoord>(`${API}?alleen=archief&van=${v}&tot=${tt}`)
      .then((a) => setUit(a))
      .catch((e: unknown) => setFout(foutVan(e)));
  }, []);

  function verstuur(e: FormEvent) {
    e.preventDefault();
    void zoekNu(van, tot);
  }

  const wissel = (lijst: string[], zet: (l: string[]) => void, waarde: string) => zet(lijst.includes(waarde) ? lijst.filter((x) => x !== waarde) : [...lijst, waarde]);
  const soortLabel: Record<string, string> = { tafel: t.inDeZaak, afhalen: t.afhalen, bezorgen: t.bezorgen };
  const bronLabel: Record<string, string> = { qr: t.qr, bediening: t.bediening, kassa: t.kassa, online: t.online };
  const s = uit?.samenvatting;

  return (
    <div className="space-y-5">
      <form onSubmit={verstuur} className="card space-y-4 p-5" aria-labelledby="archief-kop">
        <div>
          <h2 id="archief-kop" className="font-display text-lg font-bold text-ink">
            {t.kop}
          </h2>
          <p className="mt-1 text-sm text-neutralx-600">{t.uitleg}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Veld label={t.van}>
            <input className="field-input" type="date" value={van} onChange={(e) => setVan(e.target.value)} required />
          </Veld>
          <Veld label={t.tot}>
            <input className="field-input" type="date" value={tot} onChange={(e) => setTot(e.target.value)} required />
          </Veld>
          <Veld label={t.bezorger}>
            <select className="field-input" value={bezorger} onChange={(e) => setBezorger(e.target.value)}>
              <option value="">{t.alleBezorgers}</option>
              {data.bezorgen.bezorgers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.naam}
                </option>
              ))}
            </select>
          </Veld>
          <Veld label={t.zoek}>
            <input className="field-input" type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} maxLength={60} />
          </Veld>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <fieldset>
            <legend className="field-label">{t.soortKop}</legend>
            {ARCHIEF_SOORTEN.map((x) => (
              <label key={x} className="mt-1 flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={soorten.includes(x)} onChange={() => wissel(soorten, setSoorten, x)} /> {soortLabel[x]}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="field-label">{t.kanaalKop}</legend>
            {ARCHIEF_BRONNEN.map((x) => (
              <label key={x} className="mt-1 flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={bronnen.includes(x)} onChange={() => wissel(bronnen, setBronnen, x)} /> {bronLabel[x]}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="field-label">{t.betalingKop}</legend>
            {(["alle", "ja", "nee"] as const).map((x) => (
              <label key={x} className="mt-1 flex items-center gap-2 text-sm text-ink">
                <input type="radio" name="archief-betaald" checked={betaald === x} onChange={() => setBetaald(x)} /> {x === "alle" ? t.alle : x === "ja" ? t.betaald : t.onbetaald}
              </label>
            ))}
            <label className="mt-2 flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={geannuleerd} onChange={(e) => setGeannuleerd(e.target.checked)} /> {t.geannuleerd}
            </label>
          </fieldset>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary">
            {t.zoeken}
          </button>
          {van && tot && (
            <a className="btn-ghost" href={`${API}?alleen=archief-csv&${query(van, tot)}`}>
              {t.csv}
            </a>
          )}
        </div>
      </form>
      <Melding fout={fout} />

      {uit && (
        <section className="card space-y-3 p-5" aria-labelledby="archief-uitslag">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="archief-uitslag" className="font-display text-lg font-bold text-ink" aria-live="polite">
              {uit.rijen.length === 1 ? t.resultatenEen : t.resultaten.replace("{n}", String(uit.rijen.length))}
            </h3>
            <button type="button" className="btn-ghost" aria-expanded={omzet} onClick={() => setOmzet((o) => !o)}>
              {omzet ? t.omzetVerbergen : t.omzetTonen}
            </button>
          </div>
          {uit.meer && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-ink">
              {t.meer}
            </p>
          )}
          {omzet && s && (
            <div className="rounded-xl bg-neutralx-50 p-4 text-sm text-ink">
              <p>
                <strong>{t.omzet}:</strong> {euro(s.omzetCent)} · {s.aantal} · {t.bezorgkosten}: {euro(s.bezorgkostenCent)}
              </p>
              <table className="mt-2 w-full max-w-md text-left">
                <caption className="sr-only">{t.btwKop}</caption>
                <thead>
                  <tr className="text-neutralx-600">
                    <th scope="col">{t.tarief}</th>
                    <th scope="col" className="text-right">
                      {t.omzet}
                    </th>
                    <th scope="col" className="text-right">
                      {t.btw}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.perTarief.map((p) => (
                    <tr key={p.btw}>
                      <th scope="row" className="font-semibold">
                        {p.btw}%
                      </th>
                      <td className="text-right">{euro(p.omzetCent)}</td>
                      <td className="text-right">{euro(p.btwCent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-neutralx-600">{t.omzetUitleg}</p>
            </div>
          )}
          {uit.rijen.length === 0 ? (
            <p className="text-sm text-neutralx-500">{t.geen}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-hair text-neutralx-600">
                    <th scope="col" className="py-2 pr-3">
                      {t.datum}
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      {t.nummer}
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      {t.soortKop}
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      {t.naam}
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      {t.adres}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      {t.bedrag}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {uit.rijen.map((r) => (
                    <tr key={r.id} className={`border-b border-hair ${r.status === "GEANNULEERD" ? "text-neutralx-500 line-through" : "text-ink"}`}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {amsterdamDayKey(r.createdAt).split("-").reverse().join("-")} {amsterdamClock(r.createdAt)}
                      </td>
                      <td className="py-2 pr-3">#{r.nummer}</td>
                      <td className="py-2 pr-3">
                        {soortLabel[r.soort] ?? r.soort} · {bronLabel[r.bron] ?? r.bron}
                      </td>
                      <td className="py-2 pr-3">{r.naam || r.tafelNaam || "—"}</td>
                      <td className="py-2 pr-3">{r.soort === "bezorgen" ? `${r.adres}, ${r.postcode} ${r.plaats}` : "—"}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {euro(teBetalenCent(r))}
                        <span className="block text-xs text-neutralx-600">{r.betaald ? t.betaald : t.onbetaald}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
