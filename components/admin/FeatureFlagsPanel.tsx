"use client";

import { useCallback, useEffect, useState } from "react";

interface Override {
  enabled?: boolean;
  rolloutPct?: number;
  roles?: string[];
  note?: string;
  updatedAt: string;
  updatedBy: string;
}
interface Row {
  key: string;
  label: string;
  description: string;
  default: boolean;
  override: Override | null;
}

/** Admin → Systeem: feature flags / gefaseerde uitrol zonder redeploy. */
export function FeatureFlagsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/flags", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRows(d.flags))
      .catch(() => undefined);
  }, []);
  useEffect(() => load(), [load]);

  async function save(key: string, patch: { enabled?: boolean; rolloutPct?: number }) {
    setBusy(key);
    try {
      await fetch("/api/admin/flags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ...patch }) });
      load();
    } finally {
      setBusy(null);
    }
  }
  async function reset(key: string) {
    setBusy(key);
    try {
      await fetch(`/api/admin/flags?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!rows) return null;

  const state = (r: Row): { label: string; cls: string } => {
    const o = r.override;
    if (!o) return r.default ? { label: `standaard aan`, cls: "text-neutralx-500" } : { label: "standaard uit", cls: "text-neutralx-500" };
    if (o.enabled === false && o.rolloutPct == null) return { label: "uit", cls: "text-crit" };
    if (typeof o.rolloutPct === "number" && o.enabled !== true) return { label: `${o.rolloutPct}% uitrol`, cls: "text-warn" };
    return { label: "aan", cls: "text-brand-700" };
  };

  return (
    <section className="mt-8 rounded-2xl border border-hair bg-white">
      <div className="border-b border-hair px-5 py-4">
        <h2 className="font-display text-base font-bold text-ink">Feature flags</h2>
        <p className="text-xs text-neutralx-500">Functies aan/uit of gefaseerd uitrollen (% gebruikers) zonder nieuwe deploy. Een gebruiker blijft stabiel in of uit een uitrol.</p>
      </div>
      <ul className="divide-y divide-hair">
        {rows.map((r) => {
          const s = state(r);
          const pct = r.override?.rolloutPct ?? "";
          return (
            <li key={r.key} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="text-sm font-medium text-ink">{r.label}</span>
                  <span className="ml-2 font-mono text-[11px] text-neutralx-400">{r.key}</span>
                  <span className="block text-xs text-neutralx-500">{r.description}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${s.cls}`}>{s.label}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy === r.key} onClick={() => save(r.key, { enabled: true })} className="rounded-full border border-hairstrong px-3 py-1 text-xs hover:bg-paper-soft disabled:opacity-50">
                  Aan
                </button>
                <button type="button" disabled={busy === r.key} onClick={() => save(r.key, { enabled: false })} className="rounded-full border border-hairstrong px-3 py-1 text-xs hover:bg-paper-soft disabled:opacity-50">
                  Uit
                </button>
                <label className="flex items-center gap-1 text-xs text-neutralx-600">
                  Uitrol
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={pct}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save(r.key, { rolloutPct: Math.max(0, Math.min(100, Number((e.target as HTMLInputElement).value) || 0)) });
                    }}
                    className="field-input w-16 py-1 text-xs"
                  />
                  %
                </label>
                {r.override && (
                  <button type="button" disabled={busy === r.key} onClick={() => reset(r.key)} className="text-xs text-neutralx-500 underline hover:text-ink disabled:opacity-50">
                    standaard
                  </button>
                )}
                {r.override && <span className="text-[11px] text-neutralx-400">door {r.override.updatedBy}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
