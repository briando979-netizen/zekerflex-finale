"use client";

import { useCallback, useEffect, useState } from "react";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding } from "@/components/rijschool/ui";
import { euro } from "@/lib/horeca/weergave";
import type { Cijfers } from "@/lib/horeca/cijfers";

const API = "/api/horeca/beheer";
const dagLabel = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

// Eén reeks staafjes (omzet per dag, drukte per uur): één kleur, dunne staven met
// afgeronde bovenkant, de waarde bij aanwijzen of focus, en een tabel als alternatief.
function Staven({ titel, items, kleur, waarde }: { titel: string; items: { label: string; kort: string; v: number }[]; kleur: string; waarde: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.v));
  return (
    <figure className="card p-5">
      <figcaption className="text-sm font-semibold text-ink">{titel}</figcaption>
      <div className="mt-4 flex h-36 items-end gap-[2px]" role="list" aria-label={titel}>
        {items.map((i) => (
          <div key={i.label} role="listitem" tabIndex={0} aria-label={`${i.label}: ${waarde(i.v)}`} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end outline-none">
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white shadow group-hover:block group-focus:block">
              {i.label}: {waarde(i.v)}
            </span>
            <div className={`w-full rounded-t-[4px] ${kleur} group-hover:opacity-80 group-focus:opacity-80`} style={{ height: i.v > 0 ? `${Math.max(3, (i.v / max) * 100)}%` : "1px", opacity: i.v > 0 ? undefined : 0.35 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] border-t border-hair pt-1 text-[10px] text-neutralx-500" aria-hidden>
        {items.map((i, n) => (
          <span key={i.label} className="min-w-0 flex-1 truncate text-center">
            {items.length > 12 && n % Math.ceil(items.length / 8) !== 0 ? "" : i.kort}
          </span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-neutralx-600">Toon als tabel</summary>
        <table className="mt-2 w-full text-left">
          <tbody>
            {items.map((i) => (
              <tr key={i.label} className="border-b border-hair">
                <th scope="row" className="py-1 font-normal text-neutralx-600">
                  {i.label}
                </th>
                <td className="py-1 text-right text-ink">{waarde(i.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// Tabblad Cijfers: omzet, bestellingen, couverts, no-shows, top-gerechten en
// drukte, over 7 of 30 dagen (lib/horeca/cijfers.ts).
export function CijfersTab() {
  const [dagen, setDagen] = useState<7 | 30>(7);
  const [c, setC] = useState<Cijfers | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const laad = useCallback(async (n: 7 | 30) => {
    setFout(null);
    try {
      setC(await stuur<Cijfers>(`${API}?alleen=cijfers&dagen=${n}`));
    } catch (e) {
      setFout(foutVan(e));
    }
  }, []);
  useEffect(() => {
    void laad(dagen);
  }, [laad, dagen]);

  if (!c) return fout ? <Melding fout={fout} /> : <p className="text-sm text-neutralx-500">Cijfers laden…</p>;
  const t = c.totaal;
  const tegels: { label: string; waarde: string; uitleg?: string }[] = [
    { label: "Omzet", waarde: euro(t.omzetCent), uitleg: "uit bestellingen via ZekerFlex" },
    { label: "Bestellingen", waarde: String(t.bestellingen), uitleg: t.bestellingen ? `${t.zelfBesteldProcent}% zelf via de QR-code` : "" },
    { label: "Gemiddelde bon", waarde: t.bestellingen ? euro(t.gemiddeldeBonCent) : "–" },
    { label: "Couverts", waarde: String(t.couverts), uitleg: t.reserveringen ? `${t.reserveringen} reserveringen, ${t.onlineGereserveerdProcent}% online` : "" },
    { label: "Niet gekomen", waarde: `${t.noShowProcent}%`, uitleg: `${t.noShows} ${t.noShows === 1 ? "reservering" : "reserveringen"}` },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periode">
        {([7, 30] as const).map((n) => (
          <button key={n} type="button" aria-pressed={dagen === n} onClick={() => setDagen(n)} className={dagen === n ? "btn-primary" : "btn-ghost"}>
            Laatste {n} dagen
          </button>
        ))}
      </div>
      <Melding fout={fout} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tegels.map((k) => (
          <div key={k.label} className="card min-w-0 p-4">
            <p className="text-xs font-semibold text-neutralx-600">{k.label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-ink">{k.waarde}</p>
            {k.uitleg ? <p className="mt-0.5 text-xs text-neutralx-600">{k.uitleg}</p> : null}
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Staven titel="Omzet per dag" kleur="bg-money" waarde={(v) => euro(v)} items={c.dagen.map((d) => ({ label: dagLabel(d.datum), kort: d.datum.slice(8), v: d.omzetCent }))} />
        <Staven
          titel="Bestellingen per uur van de dag"
          kleur="bg-neutralx-500"
          waarde={(v) => `${v} ${v === 1 ? "bestelling" : "bestellingen"}`}
          items={c.perUur.map((v, uur) => ({ label: `${String(uur).padStart(2, "0")}:00–${String(uur + 1).padStart(2, "0")}:00`, kort: String(uur), v }))}
        />
      </div>
      <section className="card p-5" aria-labelledby="top-gerechten">
        <h3 id="top-gerechten" className="text-sm font-semibold text-ink">
          Meest besteld
        </h3>
        {c.topGerechten.length ? (
          <ol className="mt-3 space-y-2 text-sm">
            {c.topGerechten.map((g, i) => (
              <li key={g.naam} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-ink">
                  {i + 1}. {g.naam}
                </span>
                <span className="flex-shrink-0 text-neutralx-600">
                  {g.aantal}× · {euro(g.omzetCent)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-neutralx-600">Nog geen bestellingen in deze periode.</p>
        )}
      </section>
    </div>
  );
}
