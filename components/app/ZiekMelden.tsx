"use client";

import { useState } from "react";

/** Uitzendkracht: ziek melden — zoekt automatisch vervanging voor je geplande diensten. */
export function ZiekMelden() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ shifts: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-hair bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Ziek melden</h2>
          <p className="text-xs text-neutralx-500">We zoeken meteen vervanging voor je geplande diensten en melden het aan je opdrachtgever.</p>
        </div>
        {!open && !done && (
          <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-hairstrong px-4 py-1.5 text-sm font-semibold text-ink hover:bg-paper-soft">
            Ziek melden
          </button>
        )}
      </div>

      {done && (
        <p className="mt-3 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-800">
          Beterschap! {done.shifts > 0 ? `Voor ${done.shifts} dienst(en) zoeken we nu vervanging.` : "Er stonden geen diensten gepland."}
        </p>
      )}

      {open && !done && (
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const r = await fetch("/api/me/ziekmelding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, ...(to ? { to } : {}) }) });
              const d = await r.json();
              if (!r.ok) throw new Error(d?.error?.message ?? "Mislukt");
              setDone({ shifts: d.shifts?.length ?? 0 });
            } catch (e2) {
              setErr((e2 as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="field-label">Vanaf</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required className="field-input" />
            </label>
            <label className="block text-sm">
              <span className="field-label">Tot (optioneel)</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="field-input" />
            </label>
          </div>
          {err && <p className="text-xs text-crit">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              {busy ? "Bezig…" : "Bevestig ziekmelding"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-neutralx-500">
              Annuleren
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
