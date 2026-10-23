"use client";

import { useCallback, useEffect, useState } from "react";

interface Signal {
  code: string;
  label: string;
  weight: number;
}
interface Pair {
  tenantId: string;
  bedrijf: string;
  freelancerId: string;
  werknemer: string;
  shifts: number;
  totaalCents: number;
  werknemerConcentratie: number;
  klantConcentratie: number;
  zonderCheckin: number;
  instantGoedgekeurd: number;
  nieuwePartij: boolean;
  score: number;
  signalen: Signal[];
}

const eur = (c: number) => `€ ${(c / 100).toFixed(0)}`;

/** Admin → Fraude: verdachte opdrachtgever↔werknemer-paren (collusie/witwas). */
export function CollusionBoard() {
  const [days, setDays] = useState(90);
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((d: number) => {
    setBusy(true);
    fetch(`/api/admin/fraude/collusie?days=${d}&minScore=50`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => setPairs(res?.pairs ?? []))
      .catch(() => setPairs([]))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => load(days), [load, days]);

  return (
    <section className="rounded-2xl border border-hair bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Collusie-signalen</h2>
          <p className="text-xs text-neutralx-500">Paren die samen geld kunnen rondpompen. Dit is een signaal voor onderzoek, geen oordeel.</p>
        </div>
        <label className="text-xs text-neutralx-600">
          Periode{" "}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="field-input ml-1 w-auto py-1 text-xs">
            <option value={30}>30 dagen</option>
            <option value={90}>90 dagen</option>
            <option value={180}>180 dagen</option>
          </select>
        </label>
      </div>
      {busy && !pairs ? (
        <p className="px-5 py-6 text-sm text-neutralx-500">Analyseren…</p>
      ) : pairs && pairs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-neutralx-500">Geen verdachte paren in deze periode. 👍</p>
      ) : (
        <ul className="divide-y divide-hair">
          {pairs?.map((p) => (
            <li key={`${p.tenantId}:${p.freelancerId}`} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">
                  {p.bedrijf} <span className="text-neutralx-400">↔</span> {p.werknemer}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.score >= 70 ? "bg-crit/10 text-crit" : "bg-warn/10 text-warn"}`}>risico {p.score}</span>
              </div>
              <p className="mt-0.5 text-xs text-neutralx-500">
                {p.shifts} diensten · {eur(p.totaalCents)} · werknemer {Math.round(p.werknemerConcentratie * 100)}% / klant {Math.round(p.klantConcentratie * 100)}% exclusief
                {p.nieuwePartij && " · nieuwe accounts"}
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {p.signalen.map((s) => (
                  <li key={s.code} className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-600">
                    {s.label}
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 flex gap-3 text-[11px]">
                <a href={`/admin/bedrijven?tenant=${p.tenantId}`} className="font-semibold text-brand-700 hover:underline">
                  Bekijk bedrijf →
                </a>
                <a href={`/admin/gebruikers?freelancer=${p.freelancerId}`} className="font-semibold text-brand-700 hover:underline">
                  Bekijk werknemer →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
