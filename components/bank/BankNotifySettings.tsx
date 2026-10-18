"use client";

import { useEffect, useState } from "react";

interface Prefs {
  incoming: boolean;
  card: boolean;
  standing: boolean;
  lowBalanceCents: number;
}

/** Which bank notifications to get (push + the bell). */
export function BankNotifySettings({ onChanged }: { onChanged: (n: { ok: boolean; text: string }) => void | Promise<void> }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    void fetch("/api/me/bank/notify", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPrefs(d.prefs));
  }, []);
  if (!prefs) return null;

  async function save(next: Prefs) {
    setPrefs(next);
    const res = await fetch("/api/me/bank/notify", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => null);
    if (!res?.ok) await onChanged({ ok: false, text: "Meldingen opslaan lukte niet." });
  }

  return (
    <div className="card space-y-3 p-5 text-sm">
      <div>
        <p className="font-semibold text-ink">🔔 Meldingen</p>
        <p className="text-xs text-neutralx-500">Op je telefoon (zet pushmeldingen aan bij Account) en in de meldingenbel.</p>
      </div>
      {(
        [
          ["incoming", "Geld ontvangen"],
          ["card", "Elke pasbetaling (en geweigerde betalingen)"],
          ["standing", "Vaste opdracht niet gelukt"],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="flex items-center justify-between gap-3">
          <span>{label}</span>
          <input type="checkbox" checked={prefs[k]} onChange={(e) => save({ ...prefs, [k]: e.target.checked })} />
        </label>
      ))}
      <label className="flex items-center justify-between gap-3">
        <span>Waarschuw als mijn saldo lager is dan</span>
        <select value={prefs.lowBalanceCents} onChange={(e) => save({ ...prefs, lowBalanceCents: Number(e.target.value) })} className="rounded-lg border border-hairstrong bg-white px-2 py-1 text-xs">
          {[0, 1_000, 2_000, 5_000, 10_000, 25_000].map((v) => (
            <option key={v} value={v}>
              {v === 0 ? "uit" : `€ ${v / 100}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
