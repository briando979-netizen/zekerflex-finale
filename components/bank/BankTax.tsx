"use client";

import { useCallback, useEffect, useState } from "react";

interface Overview {
  year: number;
  pct: number;
  quarters: { quarter: number; revenueCents: number; vatCents: number; incomeTaxCents: number; invoices: number }[];
  currentQuarter: number;
  toReserveCents: number;
  inPotCents: number;
  missingCents: number;
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

/** zzp tax help: btw + income-tax reservation per quarter, one-tap reserve, year CSV. */
export function BankTax({ canManage, onChanged }: { canManage: boolean; onChanged: (n: { ok: boolean; text: string }) => void | Promise<void> }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/me/bank/tax?year=${year}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, [year]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="py-10 text-center text-sm text-neutralx-400">Laden…</p>;
  const pctDone = data.toReserveCents ? Math.min(100, Math.round((data.inPotCents / data.toReserveCents) * 100)) : 100;
  const isThisYear = data.year === new Date().getFullYear();

  return (
    <div className="space-y-5">
      {isThisYear && (
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Apart zetten voor de Belastingdienst</span>
              <span className="block text-xs text-neutralx-500">
                Btw van Q{data.currentQuarter} + {data.pct}% inkomstenbelasting over je omzet tot nu toe
              </span>
            </span>
            <span className="num font-display text-2xl font-bold text-ink">{euro(data.toReserveCents)}</span>
          </div>
          <div>
            <div className="h-2.5 overflow-hidden rounded-full bg-paper-soft">
              <div className={`h-full rounded-full ${pctDone >= 100 ? "bg-ok" : "bg-warn"}`} style={{ width: `${pctDone}%` }} />
            </div>
            <p className="mt-1 text-xs text-neutralx-500">
              {euro(data.inPotCents)} in je potje Belasting{data.missingCents > 0 ? ` · nog ${euro(data.missingCents)} te gaan` : " · je bent op schema ✓"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canManage && data.missingCents > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await fetch("/api/me/bank/tax", { method: "POST" }).catch(() => null);
                  const d = res ? await res.json().catch(() => ({})) : {};
                  setBusy(false);
                  await onChanged(res?.ok ? { ok: true, text: `${euro(d.reservedCents)} apart gezet in je potje Belasting.` } : { ok: false, text: d?.error?.message ?? "Dat lukte niet." });
                  await load();
                }}
                className="btn-primary text-sm disabled:opacity-50"
              >
                Zet {euro(data.missingCents)} apart
              </button>
            )}
            <label className="flex items-center gap-2 text-xs text-neutralx-600">
              Inkomstenbelasting reserveren:
              <select
                value={data.pct}
                onChange={async (e) => {
                  await fetch("/api/me/bank/tax", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pct: Number(e.target.value) }) });
                  await load();
                }}
                className="rounded-lg border border-hairstrong bg-white px-2 py-1"
              >
                {[0, 15, 20, 25, 30, 35, 40, 45].map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
          <span className="text-sm font-semibold">Kwartalen {data.year}</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="ml-auto rounded-lg border border-hairstrong bg-white px-2 py-1 text-xs">
            {[0, 1, 2].map((d) => {
              const y = new Date().getFullYear() - d;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>
          <a href={`/api/me/bank/tax?year=${year}&format=csv`} className="text-xs font-semibold text-brand-600 hover:underline">
            Jaaroverzicht (CSV) voor je boekhouder
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                <th className="px-5 py-2.5 font-medium">Kwartaal</th>
                <th className="px-5 py-2.5 text-right font-medium">Omzet excl. btw</th>
                <th className="px-5 py-2.5 text-right font-medium">Btw af te dragen</th>
                <th className="px-5 py-2.5 text-right font-medium">IB-reservering</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {data.quarters.map((q) => (
                <tr key={q.quarter} className={isThisYear && q.quarter === data.currentQuarter ? "bg-brand-50/40" : ""}>
                  <td className="px-5 py-3">
                    Q{q.quarter} <span className="text-xs text-neutralx-400">({q.invoices} facturen)</span>
                  </td>
                  <td className="num px-5 py-3 text-right">{euro(q.revenueCents)}</td>
                  <td className="num px-5 py-3 text-right font-semibold">{euro(q.vatCents)}</td>
                  <td className="num px-5 py-3 text-right text-neutralx-600">{euro(q.incomeTaxCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-neutralx-400">
        Gebaseerd op de facturen die ZekerFlex namens jou maakte. De IB-reservering is een vuistregel, geen belastingadvies — je echte aanslag hangt af van aftrekposten (zelfstandigenaftrek, MKB-vrijstelling) en je andere inkomsten.
      </p>
    </div>
  );
}
