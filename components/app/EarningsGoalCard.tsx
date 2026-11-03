"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { goalProgress } from "@/lib/dashboard/goal-progress";
import { useFT } from "@/components/i18n/useFT";

const euro = (cents: number) => `€ ${Math.round(cents / 100).toLocaleString("nl-NL")}`;

// Eigen verdiendoel per maand op de loon-vooruitblik (lib/dashboard/earnings-goal).
export function EarningsGoalCard({
  initialGoalCents,
  workedCents,
  expectedCents,
  monthLabel,
}: {
  initialGoalCents: number | null;
  workedCents: number;
  expectedCents: number;
  monthLabel: string;
}) {
  const t = useFT().goal;
  const [goal, setGoal] = useState(initialGoalCents);
  const [editing, setEditing] = useState(initialGoalCents === null);
  const [draft, setDraft] = useState(initialGoalCents ? String(Math.round(initialGoalCents / 100)) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (monthlyCents: number | null) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/me/verdiendoel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyCents }),
      });
      const body = (await r.json().catch(() => null)) as { monthlyCents?: number | null; error?: { message?: string } } | null;
      if (!r.ok) {
        setError(body?.error?.message ?? t.saveFailed);
        return;
      }
      setGoal(body?.monthlyCents ?? null);
      setEditing(body?.monthlyCents == null);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const euros = Number(draft.replace(/[.\s]/g, "").replace(",", "."));
    if (!Number.isFinite(euros) || euros <= 0) {
      setError(t.invalid);
      return;
    }
    void save(Math.round(euros) * 100);
  };

  if (editing || goal === null) {
    return (
      <form onSubmit={submit} className="rounded-2xl border border-neutralx-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold">{t.setTitle(monthLabel)}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{t.setBody}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="verdiendoel" className="sr-only">
            {t.inputLabel}
          </label>
          <span className="text-sm font-semibold text-ink">€</span>
          <input
            id="verdiendoel"
            inputMode="numeric"
            placeholder="2000"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-32 rounded-lg border border-neutralx-200 px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy} className="btn-primary text-sm disabled:opacity-50">
            {t.save}
          </button>
          {goal !== null && (
            <button type="button" onClick={() => setEditing(false)} className="px-2 text-sm text-neutralx-500 hover:text-ink">
              {t.cancel}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-crit">
            {error}
          </p>
        )}
      </form>
    );
  }

  const p = goalProgress(goal, workedCents, expectedCents);
  return (
    <div className="rounded-2xl border border-neutralx-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{t.title(monthLabel, euro(goal))}</h2>
          <p className="mt-1 text-sm text-neutralx-600">
            {p.reached
              ? t.reached
              : t.progress(p.expectedPct, euro(p.remainingCents))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(String(Math.round(goal / 100)));
            setEditing(true);
          }}
          className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
        >
          {t.edit}
        </button>
      </div>
      <div className="relative mt-4 h-3 w-full overflow-hidden rounded-full bg-neutralx-200" role="img" aria-label={t.aria(p.workedPct, p.expectedPct)}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand-300" style={{ width: `${p.expectedPct}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand-600" style={{ width: `${p.workedPct}%` }} />
      </div>
      <p className="mt-2 text-xs text-neutralx-500">
        <span className="font-semibold text-brand-700">■</span> {t.legendWorked} · <span className="font-semibold text-brand-400">■</span> {t.legendPlanned}
      </p>
      {!p.reached && (
        <Link href="/dashboard" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
          {t.find}
        </Link>
      )}
      <button type="button" onClick={() => void save(null)} disabled={busy} className="ml-4 mt-3 text-xs text-neutralx-400 hover:text-crit">
        {t.remove}
      </button>
    </div>
  );
}
