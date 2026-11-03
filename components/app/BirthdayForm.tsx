"use client";

import { useState } from "react";

// Optional birthday (day and month only) — on that day ZekerFlex celebrates with you (lib/seasons).

const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export function BirthdayForm({ initial }: { initial: string | null }) {
  const [month, setMonth] = useState(initial ? Number(initial.slice(0, 2)) : 0);
  const [day, setDay] = useState(initial ? Number(initial.slice(3, 5)) : 0);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (maand: number | null, dag: number | null) => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/me/verjaardag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maand, dag }) }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setMessage({ ok: false, text: data?.error?.message ?? "Opslaan lukte niet." });
    setSaved(data.verjaardag ?? null);
    if (!data.verjaardag) {
      setMonth(0);
      setDay(0);
    }
    setMessage({ ok: true, text: data.verjaardag ? "Opgeslagen. Op je verjaardag vieren we het met je mee." : "Verwijderd." });
  };

  return (
    <form
      className="space-y-3 p-5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void send(month, day);
      }}
    >
      <p className="text-neutralx-600">Op je verjaardag viert ZekerFlex het met je mee. Alleen dag en maand, geen jaar; je mag het ook leeg laten.</p>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutralx-500">Dag</span>
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm">
            <option value={0}>Kies</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutralx-500">Maand</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm">
            <option value={0}>Kies</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !month || !day} className="btn-primary disabled:opacity-50">{busy ? "Bezig…" : "Opslaan"}</button>
        {saved && (
          <button type="button" disabled={busy} onClick={() => void send(null, null)} className="text-xs font-semibold text-neutralx-500 underline hover:text-crit">
            Verwijderen
          </button>
        )}
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-ok" : "text-crit"}>{message.text}</p>}
    </form>
  );
}
