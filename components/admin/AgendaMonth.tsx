"use client";

import { useMemo, useState } from "react";

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const TZ = "Europe/Amsterdam";

const keyOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Maandkalender: stip op dagen met iets in de agenda. Klik op een dag om ernaartoe te gaan of iets toe te voegen. */
export function AgendaMonth({ busy, onPick, monthsAhead = 3 }: { busy: Map<string, number>; onPick: (day: string) => void; monthsAhead?: number }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const [offset, setOffset] = useState(0);
  const [thisYear, thisMonth] = today.split("-").map(Number) as [number, number];

  const { year, month, label, cells } = useMemo(() => {
    const first = new Date(Date.UTC(thisYear, thisMonth - 1 + offset, 1));
    const y = first.getUTCFullYear();
    const m = first.getUTCMonth();
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7;
    return {
      year: y,
      month: m,
      label: first.toLocaleDateString("nl-NL", { timeZone: "UTC", month: "long", year: "numeric" }),
      cells: [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)],
    };
  }, [offset, thisYear, thisMonth]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold first-letter:uppercase" style={{ color: "var(--a-text)" }}>{label}</p>
        <span className="flex gap-1">
          <button type="button" className="a-button !px-2 text-xs" disabled={offset <= 0} onClick={() => setOffset(offset - 1)} aria-label="Vorige maand">‹</button>
          <button type="button" className="a-button !px-2 text-xs" disabled={offset >= monthsAhead} onClick={() => setOffset(offset + 1)} aria-label="Volgende maand">›</button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => <span key={d} className="pb-1 text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>{d}</span>)}
        {cells.map((day, i) => {
          if (day === null) return <span key={`leeg-${i}`} />;
          const key = keyOf(year, month, day);
          const n = busy.get(key) ?? 0;
          const isToday = key === today;
          const past = key < today;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              disabled={past}
              aria-label={`${day} ${label}${n > 0 ? `, ${n} in de agenda` : ""}`}
              className="relative flex h-9 flex-col items-center justify-center rounded-md text-[0.8125rem] transition-colors hover:bg-[var(--a-elev)] disabled:cursor-default disabled:hover:bg-transparent"
              style={{ color: past ? "var(--a-mute)" : "var(--a-text)", fontWeight: isToday ? 600 : 400, boxShadow: isToday ? "inset 0 0 0 1px var(--a-border-strong)" : undefined }}
            >
              {day}
              {n > 0 && <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: "var(--a-plan)" }} aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
