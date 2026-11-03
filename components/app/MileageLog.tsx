"use client";

import { useMemo, useState } from "react";
import { KpiCard, dateShort, moneyExact } from "@/components/app/ui";
import type { Trip } from "@/lib/worker/mileage";

const kmText = (km: number) => km.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function MileageLog({
  year,
  initialTrips,
  ratePerKmCents,
  isPayroll,
}: {
  year: number;
  initialTrips: Trip[];
  ratePerKmCents: number;
  isPayroll: boolean;
}) {
  const [trips, setTrips] = useState(initialTrips);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const counted = trips.filter((t) => !t.excluded);
    const km = Math.round(counted.reduce((s, t) => s + t.km, 0) * 10) / 10;
    return { trips: counted.length, km, amountCents: Math.round(km * ratePerKmCents) };
  }, [trips, ratePerKmCents]);

  const save = async (trip: Trip, change: { km?: number | null; excluded?: boolean }) => {
    setBusy(trip.timesheetId);
    setError(null);
    try {
      const r = await fetch("/api/me/ritten", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timesheetId: trip.timesheetId, ...change }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw.");
        return;
      }
      setTrips((all) =>
        all.map((t) => {
          if (t.timesheetId !== trip.timesheetId) return t;
          const next = { ...t };
          if (change.km === null) {
            next.km = t.estimatedKm ?? 0;
            next.edited = false;
          } else if (change.km !== undefined) {
            next.km = Math.round(change.km * 10) / 10;
            next.edited = true;
          }
          if (change.excluded !== undefined) next.excluded = change.excluded;
          return next;
        }),
      );
      setDrafts(({ [trip.timesheetId]: _done, ...rest }) => rest);
    } finally {
      setBusy(null);
    }
  };

  const commitKm = (trip: Trip) => {
    const raw = drafts[trip.timesheetId];
    if (raw === undefined) return;
    const value = Number(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError("Vul een afstand in kilometers in, bijvoorbeeld 24,5.");
      return;
    }
    if (value === trip.km) {
      setDrafts(({ [trip.timesheetId]: _same, ...rest }) => rest);
      return;
    }
    void save(trip, { km: value });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Ritten" value={totals.trips.toLocaleString("nl-NL")} hint={`meegeteld in ${year}`} />
        <KpiCard label="Kilometers" value={kmText(totals.km)} hint="heen en terug" />
        <KpiCard
          label={isPayroll ? "Max. onbelast" : "Indicatieve aftrek"}
          value={moneyExact(totals.amountCents)}
          hint={`${moneyExact(ratePerKmCents)} per km`}
          tone="brand"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutralx-600">
          Klopt een afstand niet? Pas de kilometers aan. Niet met je eigen auto gegaan? Zet de rit uit.
        </p>
        {trips.length > 0 && (
          <a href={`/api/me/ritten?jaar=${year}&format=csv`} className="btn-primary text-sm">
            Download voor je boekhouder
          </a>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-crit/30 bg-crit/5 p-3 text-sm text-crit">
          {error}
        </p>
      )}

      <ul className="divide-y divide-neutralx-100 overflow-hidden rounded-2xl border border-neutralx-200 bg-white">
        {trips.map((t) => {
          const draft = drafts[t.timesheetId];
          const inputId = `km-${t.timesheetId}`;
          return (
            <li key={t.timesheetId} className={`flex flex-wrap items-center gap-x-4 gap-y-3 p-4 ${t.excluded ? "bg-neutralx-50" : ""}`}>
              <div className="w-16 shrink-0 text-sm font-semibold text-ink">{dateShort(`${t.day}T12:00:00Z`)}</div>
              <div className={`min-w-0 flex-1 ${t.excluded ? "opacity-60" : ""}`}>
                <p className="truncate text-sm font-medium text-ink">{t.company}</p>
                <p className="truncate text-xs text-neutralx-500">
                  {t.shiftTitle} · {t.destination}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={inputId} className="sr-only">
                  Kilometers heen en terug op {dateShort(`${t.day}T12:00:00Z`)}
                </label>
                <input
                  id={inputId}
                  inputMode="decimal"
                  value={draft ?? kmText(t.km)}
                  disabled={t.excluded || busy === t.timesheetId}
                  onChange={(e) => setDrafts((d) => ({ ...d, [t.timesheetId]: e.target.value }))}
                  onBlur={() => commitKm(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="w-20 rounded-lg border border-neutralx-200 px-2 py-1.5 text-right text-sm tabular-nums disabled:bg-neutralx-100"
                />
                <span className="text-xs text-neutralx-500">km</span>
                {t.edited && !t.excluded && t.estimatedKm !== null && (
                  <button
                    type="button"
                    onClick={() => void save(t, { km: null })}
                    disabled={busy === t.timesheetId}
                    className="text-xs font-medium text-brand-600 hover:underline"
                    title={`Schatting was ${kmText(t.estimatedKm)} km`}
                  >
                    schatting
                  </button>
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-neutralx-600">
                <input
                  type="checkbox"
                  checked={!t.excluded}
                  disabled={busy === t.timesheetId}
                  onChange={(e) => void save(t, { excluded: !e.target.checked })}
                  className="h-4 w-4 accent-brand-500"
                />
                meetellen
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
