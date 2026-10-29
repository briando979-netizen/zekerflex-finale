"use client";

import { useEffect, useState } from "react";

interface DemandDay {
  date: string;
  weekday: string;
  expectedShifts: number;
  expectedPositions: number;
}
interface Forecast {
  windowWeeks: number;
  sampleShifts: number;
  busiestWeekday: string | null;
  days: DemandDay[];
}

export function DemandForecast() {
  const [f, setF] = useState<Forecast | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/forecast", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setF((await res.json()) as Forecast);
      else setErr(true);
    })();
  }, []);

  if (err) return <p className="text-sm text-neutralx-500">Vooruitblik kon niet geladen worden.</p>;
  if (!f) return <div className="h-48 animate-pulse rounded-2xl bg-paper-soft" />;

  const max = Math.max(1, ...f.days.map((d) => d.expectedPositions));

  return (
    <div className="card space-y-4 p-5">
      <div>
        <p className="text-sm font-semibold text-ink">Verwachte drukte — komende 7 dagen</p>
        <p className="mt-0.5 text-xs text-neutralx-500">
          {f.sampleShifts > 0
            ? `Op basis van ${f.sampleShifts} shifts uit de afgelopen ${f.windowWeeks} ${f.windowWeeks === 1 ? "week" : "weken"}.${f.busiestWeekday ? ` Drukste dag: ${f.busiestWeekday}.` : ""}`
            : "Nog te weinig historie voor een betrouwbare voorspelling — dit vult zich vanzelf naarmate er shifts geweest zijn."}
        </p>
      </div>
      <ul className="space-y-2">
        {f.days.map((d) => (
          <li key={d.date} className="flex items-center gap-3 text-sm">
            <span className="w-28 flex-shrink-0 capitalize text-neutralx-600">
              {d.weekday} <span className="text-neutralx-400">{d.date.slice(5)}</span>
            </span>
            <span className="h-3 flex-1 overflow-hidden rounded-full bg-paper-soft">
              <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.round((d.expectedPositions / max) * 100)}%` }} />
            </span>
            <span className="w-24 flex-shrink-0 text-right text-xs text-neutralx-500">
              ± {d.expectedPositions} {d.expectedPositions === 1 ? "plek" : "plekken"}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-neutralx-400">
        Dit is een statistische schatting (gemiddelde per weekdag), geen garantie. Gebruik het om vooruit te plannen: werf of benader
        kandidaten vóór de drukke dagen.
      </p>
    </div>
  );
}
