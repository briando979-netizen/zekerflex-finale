"use client";

import { useState } from "react";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { ZIEK_NL, type ZiekTeksten } from "@/lib/account/teksten";
import { vulIn } from "@/lib/i18n/vul-in";

/** Uitzendkracht: ziek melden — zoekt automatisch vervanging voor je geplande diensten. */
/** texts: de werker-app geeft de teksten in de taal van de werker mee; zonder blijft het Nederlands. */
export function ZiekMelden({ texts = ZIEK_NL }: { texts?: ZiekTeksten } = {}) {
  const z = texts;
  const [open, setOpen] = useState(false);
  // Today in Dutch time (toISOString is UTC: between midnight and 01:00/02:00 that is still yesterday).
  const [from, setFrom] = useState(() => amsterdamDayKey(new Date()));
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ shifts: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-hair bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-ink">{z.titel}</h2>
          <p className="text-xs text-neutralx-500">{z.uitleg}</p>
        </div>
        {!open && !done && (
          <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-hairstrong px-4 py-1.5 text-sm font-semibold text-ink hover:bg-paper-soft">
            {z.knop}
          </button>
        )}
      </div>

      {done && (
        <p className="mt-3 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-800">
          {z.beterschap} {done.shifts > 0 ? vulIn(z.metDiensten, { n: done.shifts }) : z.geenDiensten}
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
              if (!r.ok) throw new Error(d?.error?.message ?? z.mislukt);
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
              <span className="field-label">{z.vanaf}</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required className="field-input" />
            </label>
            <label className="block text-sm">
              <span className="field-label">{z.tot}</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="field-input" />
            </label>
          </div>
          {err && <p role="alert" className="text-xs text-crit">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              {busy ? z.bezig : z.bevestig}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-neutralx-500">
              {z.annuleren}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
