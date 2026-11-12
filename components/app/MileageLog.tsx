"use client";

import { useMemo, useState, type FormEvent } from "react";
import { KpiCard, moneyExact } from "@/components/app/ui";
import { useFT } from "@/components/i18n/useFT";
import type { Trip } from "@/lib/worker/mileage";

const parseKm = (raw: string) => Number(raw.trim().replace(",", "."));

type ErrorBody = { error?: { message?: string } } | null;

async function failure(r: Response, fallback: string): Promise<string> {
  const body = (await r.json().catch(() => null)) as ErrorBody;
  return body?.error?.message ?? fallback;
}

export function MileageLog({
  year,
  today,
  initialTrips,
  ratePerKmCents,
  isPayroll,
}: {
  year: number;
  /** "2026-11-03" in Amsterdam, van de server zodat server en telefoon hetzelfde tonen. */
  today: string;
  initialTrips: Trip[];
  ratePerKmCents: number;
  isPayroll: boolean;
}) {
  const ft = useFT();
  const t = ft.trips;
  const kmText = (km: number) => km.toLocaleString(ft.intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // Altijd Nederlandse kalenderdag (de server draait in UTC), in de taal van de app.
  const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(ft.intl, { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });

  const [trips, setTrips] = useState(initialTrips);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ day: today.startsWith(`${year}-`) ? today : `${year}-12-31`, destination: "", company: "", purpose: "", km: "" });

  const totals = useMemo(() => {
    const counted = trips.filter((tr) => !tr.excluded);
    const km = Math.round(counted.reduce((s, tr) => s + tr.km, 0) * 10) / 10;
    return { trips: counted.length, km, amountCents: Math.round(km * ratePerKmCents) };
  }, [trips, ratePerKmCents]);

  const clearDraft = (id: string) => setDrafts(({ [id]: _done, ...rest }) => rest);

  const save = async (trip: Trip, change: { km?: number | null; excluded?: boolean }) => {
    setBusy(trip.id);
    setError(null);
    try {
      const r = await fetch("/api/me/ritten", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trip.id, ...change }),
      });
      if (!r.ok) {
        setError(await failure(r, t.saveFailed));
        return;
      }
      setTrips((all) =>
        all.map((tr) => {
          if (tr.id !== trip.id) return tr;
          const next = { ...tr };
          if (change.km === null) {
            next.km = tr.estimatedKm ?? 0;
            next.edited = false;
          } else if (change.km !== undefined) {
            next.km = Math.round(change.km * 10) / 10;
            next.edited = !tr.manual;
          }
          if (change.excluded !== undefined) next.excluded = change.excluded;
          return next;
        }),
      );
      clearDraft(trip.id);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (trip: Trip) => {
    setBusy(trip.id);
    setError(null);
    try {
      const r = await fetch(`/api/me/ritten?id=${encodeURIComponent(trip.id)}`, { method: "DELETE" });
      if (!r.ok) {
        setError(await failure(r, t.saveFailed));
        return;
      }
      setTrips((all) => all.filter((tr) => tr.id !== trip.id));
    } finally {
      setBusy(null);
    }
  };

  const commitKm = (trip: Trip) => {
    const raw = drafts[trip.id];
    if (raw === undefined) return;
    const value = parseKm(raw);
    if (raw.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError(t.kmInvalid);
      return;
    }
    if (value === trip.km) {
      clearDraft(trip.id);
      return;
    }
    void save(trip, { km: value });
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const km = parseKm(form.km);
    if (!Number.isFinite(km) || km <= 0) {
      setError(t.kmRequired);
      return;
    }
    setBusy("new");
    try {
      const r = await fetch("/api/me/ritten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: form.day, destination: form.destination, company: form.company, purpose: form.purpose, km }),
      });
      if (!r.ok) {
        setError(await failure(r, t.saveFailed));
        return;
      }
      const { trip } = (await r.json()) as { trip: Trip };
      if (trip.day.startsWith(`${year}-`)) {
        setTrips((all) => [...all, trip].sort((a, b) => a.day.localeCompare(b.day)));
      } else {
        setNotice(t.otherYear(trip.day.slice(0, 4)));
      }
      setForm((f) => ({ ...f, destination: "", purpose: "", km: "" }));
      setAdding(false);
    } finally {
      setBusy(null);
    }
  };

  const field = "w-full rounded-lg border border-hair px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label={t.kpiTrips} value={totals.trips.toLocaleString(ft.intl)} hint={t.kpiTripsHint(year)} />
        <KpiCard label={t.kpiKm} value={kmText(totals.km)} hint={t.kpiKmHint} />
        <KpiCard
          label={isPayroll ? t.kpiTaxFree : t.kpiDeduction}
          value={moneyExact(totals.amountCents)}
          hint={t.perKm(moneyExact(ratePerKmCents))}
          tone="brand"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutralx-600">{t.tip}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
            className="rounded-lg border border-hair px-3.5 py-2 text-sm font-semibold text-ink hover:bg-neutralx-50"
          >
            {t.add}
          </button>
          {trips.length > 0 && (
            <a href={`/api/me/ritten?jaar=${year}&format=csv`} className="btn-primary text-sm">
              {t.download}
            </a>
          )}
        </div>
      </div>

      {adding && (
        <form onSubmit={add} className="grid gap-3 rounded-2xl border border-hair bg-white p-5 sm:grid-cols-2">
          <p className="text-sm text-neutralx-600 sm:col-span-2">{t.formIntro}</p>
          <label className="text-sm font-medium text-ink">
            {t.date}
            <input type="date" required min="2020-01-01" max={today} value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="text-sm font-medium text-ink">
            {t.km}
            <input inputMode="decimal" required placeholder={t.kmPlaceholder} value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="text-sm font-medium text-ink">
            {t.destination}
            <input required maxLength={160} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="text-sm font-medium text-ink">
            {t.company}
            <input maxLength={120} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="text-sm font-medium text-ink sm:col-span-2">
            {t.purpose}
            <input maxLength={160} placeholder={t.purposePlaceholder} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy === "new"} className="btn-primary text-sm disabled:opacity-50">
              {t.save}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-sm font-medium text-neutralx-600 hover:text-ink">
              {t.cancel}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-crit/30 bg-crit/5 p-3 text-sm text-crit">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-hair bg-brand-50 p-3 text-sm text-brand-700">
          {notice}
        </p>
      )}

      {trips.length === 0 ? (
        <div className="rounded-2xl border border-hair bg-white px-5 py-12 text-center">
          <p className="text-4xl" aria-hidden>🚗</p>
          <p className="mt-3 font-medium text-ink">{t.emptyTitle(year)}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutralx-500">{t.emptyBody}</p>
        </div>
      ) : (
        <ul className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-white">
          {trips.map((tr) => {
            const draft = drafts[tr.id];
            const inputId = `km-${tr.id}`;
            return (
              <li key={tr.id} className={`flex flex-wrap items-center gap-x-4 gap-y-3 p-4 ${tr.excluded ? "bg-neutralx-50" : ""}`}>
                <div className="w-16 shrink-0 text-sm font-semibold text-ink">{dayLabel(tr.day)}</div>
                <div className={`min-w-0 flex-1 ${tr.excluded ? "opacity-60" : ""}`}>
                  <p className="truncate text-sm font-medium text-ink">
                    {tr.company || tr.destination}
                    {tr.manual && <span className="ml-2 rounded-full bg-neutralx-100 px-2 py-0.5 text-[11px] font-semibold text-neutralx-600">{t.manual}</span>}
                  </p>
                  <p className="truncate text-xs text-neutralx-500">{[tr.purpose, tr.company ? tr.destination : ""].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={inputId} className="sr-only">
                    {t.kmFor(dayLabel(tr.day))}
                  </label>
                  <input
                    id={inputId}
                    inputMode="decimal"
                    value={draft ?? kmText(tr.km)}
                    disabled={tr.excluded || busy === tr.id}
                    onChange={(e) => setDrafts((d) => ({ ...d, [tr.id]: e.target.value }))}
                    onBlur={() => commitKm(tr)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="w-20 rounded-lg border border-hair px-2 py-1.5 text-right text-sm tabular-nums disabled:bg-neutralx-100"
                  />
                  <span className="text-xs text-neutralx-500">km</span>
                  {tr.edited && !tr.excluded && tr.estimatedKm !== null && (
                    <button
                      type="button"
                      onClick={() => void save(tr, { km: null })}
                      disabled={busy === tr.id}
                      className="text-xs font-medium text-brand-600 hover:underline"
                      title={t.estimateWas(kmText(tr.estimatedKm))}
                    >
                      {t.estimate}
                    </button>
                  )}
                </div>
                {tr.manual ? (
                  <button
                    type="button"
                    onClick={() => void remove(tr)}
                    disabled={busy === tr.id}
                    className="text-xs font-medium text-crit hover:underline disabled:opacity-50"
                  >
                    {t.remove}
                  </button>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-neutralx-600">
                    <input
                      type="checkbox"
                      checked={!tr.excluded}
                      disabled={busy === tr.id}
                      onChange={(e) => void save(tr, { excluded: !e.target.checked })}
                      className="h-4 w-4 accent-brand-500"
                    />
                    {t.include}
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
