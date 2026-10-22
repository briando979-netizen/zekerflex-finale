"use client";

import { useCallback, useEffect, useState } from "react";

interface Action {
  key: string;
  label: string;
  description: string;
  tier: "auto" | "consent";
  cap: number;
}
interface LogEntry {
  at: string;
  action: string;
  ok: boolean;
  count: number;
  summary: string;
  details?: string[];
  trigger: string;
}
interface Data {
  settings: { enabled: boolean; disabled: string[] };
  actions: Action[];
  log: LogEntry[];
  consentTenants: number;
}

/** Admin → Autopilot: what the AI does by itself, switches, run-now and the live log. */
export function AutopilotBoard() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/autopilot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setD)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function save(enabled: boolean, disabled: string[]) {
    setBusy("save");
    await fetch("/api/admin/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, disabled }) }).catch(() => undefined);
    setBusy(null);
    load();
  }

  async function run(only?: string[]) {
    setBusy(only?.[0] ?? "all");
    setMsg(null);
    try {
      const r = await fetch("/api/admin/autopilot/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(only ? { only } : {}) });
      const rep = await r.json();
      setMsg(r.ok ? (rep.ran?.length ? rep.ran.map((x: { summary: string }) => x.summary).join(" · ") : "Niets gedraaid (bezig of uitgezet).") : rep?.error?.message ?? "Mislukt");
    } finally {
      setBusy(null);
      load();
    }
  }

  if (!d) return <p className="text-sm text-neutralx-500">Laden…</p>;
  const { settings } = d;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hair bg-white px-5 py-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={settings.enabled} disabled={busy !== null} onChange={(e) => void save(e.target.checked, settings.disabled)} className="h-5 w-5 accent-brand-500" />
          <span>
            <span className="block text-sm font-semibold text-ink">Autopilot {settings.enabled ? "aan" : "uit"}</span>
            <span className="block text-xs text-neutralx-500">Draait elke ochtend en middag vanzelf. {d.consentTenants} organisatie(s) lieten uren automatisch goedkeuren.</span>
          </span>
        </label>
        <button type="button" disabled={busy !== null} onClick={() => void run()} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {busy === "all" ? "Bezig…" : "Nu draaien"}
        </button>
      </div>
      {msg && <p className="rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-800">{msg}</p>}

      <div className="rounded-2xl border border-hair bg-white">
        <p className="border-b border-hair px-5 py-3 font-display text-sm font-bold text-ink">Wat de AI zelf doet</p>
        <ul className="divide-y divide-hair">
          {d.actions.map((a) => {
            const on = !settings.disabled.includes(a.key);
            return (
              <li key={a.key} className="flex items-start gap-3 px-5 py-3">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={busy !== null}
                  onChange={(e) => void save(settings.enabled, e.target.checked ? settings.disabled.filter((k) => k !== a.key) : [...settings.disabled, a.key])}
                  className="mt-1 h-4 w-4 accent-brand-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {a.label}{" "}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.tier === "auto" ? "bg-brand-50 text-brand-700" : "bg-warn/10 text-warn"}`}>
                      {a.tier === "auto" ? "volautomatisch" : "met toestemming opdrachtgever"}
                    </span>
                  </p>
                  <p className="text-xs text-neutralx-500">{a.description} Max {a.cap} per run.</p>
                </div>
                <button type="button" disabled={busy !== null || !on} onClick={() => void run([a.key])} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-40">
                  {busy === a.key ? "…" : "Draai"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-hair bg-white">
        <p className="border-b border-hair px-5 py-3 font-display text-sm font-bold text-ink">Live logboek</p>
        {d.log.length === 0 ? (
          <p className="px-5 py-4 text-sm text-neutralx-500">Nog niets gedraaid.</p>
        ) : (
          <ul className="max-h-[520px] divide-y divide-hair overflow-y-auto">
            {d.log.map((l, i) => (
              <li key={i} className="px-5 py-2.5 text-sm">
                <span className="font-mono text-[11px] text-neutralx-400">{new Date(l.at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>{" "}
                <span className={l.ok ? "text-ink" : "text-crit"}>{l.ok ? "✓" : "✗"} {d.actions.find((a) => a.key === l.action)?.label ?? l.action}</span>
                <span className="text-neutralx-500"> — {l.summary}</span>
                <span className="ml-1 text-[10px] text-neutralx-400">({l.trigger})</span>
                {l.details && l.details.length > 0 && (
                  <details className="mt-1 text-xs text-neutralx-500">
                    <summary className="cursor-pointer">details</summary>
                    <ul className="list-disc pl-5">
                      {l.details.map((x, j) => (
                        <li key={j}>{x}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
