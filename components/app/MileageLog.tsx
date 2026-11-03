"use client";

import { useMemo, useState, type FormEvent } from "react";
import { KpiCard, dateShort, moneyExact } from "@/components/app/ui";
import type { Trip } from "@/lib/worker/mileage";

const kmText = (km: number) => km.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const parseKm = (raw: string) => Number(raw.trim().replace(",", "."));
const dayLabel = (day: string) => dateShort(`${day}T12:00:00Z`);

type ErrorBody = { error?: { message?: string } } | null;

async function failure(r: Response): Promise<string> {
  const body = (await r.json().catch(() => null)) as ErrorBody;
  return body?.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw.";
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
  const [trips, setTrips] = useState(initialTrips);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ day: today.startsWith(`${year}-`) ? today : `${year}-12-31`, destination: "", company: "", purpose: "", km: "" });

  const totals = useMemo(() => {
    const counted = trips.filter((t) => !t.excluded);
    const km = Math.round(counted.reduce((s, t) => s + t.km, 0) * 10) / 10;
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
        setError(await failure(r));
        return;
      }
      setTrips((all) =>
        all.map((t) => {
          if (t.id !== trip.id) return t;
          const next = { ...t };
          if (change.km === null) {
            next.km = t.estimatedKm ?? 0;
            next.edited = false;
          } else if (change.km !== undefined) {
            next.km = Math.round(change.km * 10) / 10;
            next.edited = !t.manual;
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
        setError(await failure(r));
        return;
      }
      setTrips((all) => all.filter((t) => t.id !== trip.id));
    } finally {
      setBusy(null);
    }
  };

  const commitKm = (trip: Trip) => {
    const raw = drafts[trip.id];
    if (raw === undefined) return;
    const value = parseKm(raw);
    if (raw.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError("Vul een afstand in kilometers in, bijvoorbeeld 24,5.");
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
      setError("Vul de kilometers van de rit in, heen en terug samen.");
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
        setError(await failure(r));
        return;
      }
      const { trip } = (await r.json()) as { trip: Trip };
      if (trip.day.startsWith(`${year}-`)) {
        setTrips((all) => [...all, trip].sort((a, b) => a.day.localeCompare(b.day)));
      } else {
        setNotice(`De rit staat bij ${trip.day.slice(0, 4)}. Kies dat jaar bovenaan om hem te zien.`);
      }
      setForm((f) => ({ ...f, destination: "", purpose: "", km: "" }));
      setAdding(false);
    } finally {
      setBusy(null);
    }
  };

  const field = "w-full rounded-lg border border-neutralx-200 px-3 py-2 text-sm";

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
          Klopt een afstand niet? Pas de kilometers aan. Niet met je eigen auto gegaan, of reiskosten al vergoed gekregen? Zet de
          rit uit.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
            className="rounded-lg border border-neutralx-200 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-neutralx-50"
          >
            + Rit toevoegen
          </button>
          {trips.length > 0 && (
            <a href={`/api/me/ritten?jaar=${year}&format=csv`} className="btn-primary text-sm">
              Download voor je boekhouder
            </a>
          )}
        </div>
      </div>

      {adding && (
        <form onSubmit={add} className="grid gap-3 rounded-2xl border border-neutralx-200 bg-white p-5 sm:grid-cols-2">
          <p className="text-sm text-neutralx-600 sm:col-span-2">
            Voor werk buiten ZekerFlex, of een zakelijke rit die niet bij een dienst hoort. Vul de kilometers heen en terug
            samen in.
          </p>
          <label className="text-sm font-medium text-ink">
            Datum
            <input type="date" required min="2020-01-01" max={today} value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="text-sm font-medium text-ink">
            Kilometers heen en terug
            <input inputMode="decimal" required placeholder="bijv. 36,4" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="text-sm font-medium text-ink">
            Naar (adres of plaats)
            <input required maxLength={160} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="text-sm font-medium text-ink">
            Opdrachtgever
            <input maxLength={120} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="text-sm font-medium text-ink sm:col-span-2">
            Doel van de rit
            <input maxLength={160} placeholder="bijv. klus, overleg, inkoop materiaal" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy === "new"} className="btn-primary text-sm disabled:opacity-50">
              Rit opslaan
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-sm font-medium text-neutralx-600 hover:text-ink">
              Annuleren
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
        <p role="status" className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">
          {notice}
        </p>
      )}

      {trips.length === 0 ? (
        <div className="rounded-2xl border border-neutralx-200 bg-white px-5 py-12 text-center">
          <p className="text-4xl" aria-hidden>🚗</p>
          <p className="mt-3 font-medium text-ink">Nog geen ritten in {year}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutralx-500">
            Zodra je je uren voor een dienst indient, verschijnt de rit hier vanzelf. Andere zakelijke ritten voeg je zelf toe.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-neutralx-100 overflow-hidden rounded-2xl border border-neutralx-200 bg-white">
          {trips.map((t) => {
            const draft = drafts[t.id];
            const inputId = `km-${t.id}`;
            return (
              <li key={t.id} className={`flex flex-wrap items-center gap-x-4 gap-y-3 p-4 ${t.excluded ? "bg-neutralx-50" : ""}`}>
                <div className="w-16 shrink-0 text-sm font-semibold text-ink">{dayLabel(t.day)}</div>
                <div className={`min-w-0 flex-1 ${t.excluded ? "opacity-60" : ""}`}>
                  <p className="truncate text-sm font-medium text-ink">
                    {t.company || t.destination}
                    {t.manual && <span className="ml-2 rounded-full bg-neutralx-100 px-2 py-0.5 text-[11px] font-semibold text-neutralx-600">zelf ingevoerd</span>}
                  </p>
                  <p className="truncate text-xs text-neutralx-500">{[t.purpose, t.company ? t.destination : ""].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={inputId} className="sr-only">
                    Kilometers heen en terug op {dayLabel(t.day)}
                  </label>
                  <input
                    id={inputId}
                    inputMode="decimal"
                    value={draft ?? kmText(t.km)}
                    disabled={t.excluded || busy === t.id}
                    onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
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
                      disabled={busy === t.id}
                      className="text-xs font-medium text-brand-600 hover:underline"
                      title={`Schatting was ${kmText(t.estimatedKm)} km`}
                    >
                      schatting
                    </button>
                  )}
                </div>
                {t.manual ? (
                  <button
                    type="button"
                    onClick={() => void remove(t)}
                    disabled={busy === t.id}
                    className="text-xs font-medium text-crit hover:underline disabled:opacity-50"
                  >
                    verwijderen
                  </button>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-neutralx-600">
                    <input
                      type="checkbox"
                      checked={!t.excluded}
                      disabled={busy === t.id}
                      onChange={(e) => void save(t, { excluded: !e.target.checked })}
                      className="h-4 w-4 accent-brand-500"
                    />
                    meetellen
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
