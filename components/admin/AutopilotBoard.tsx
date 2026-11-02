"use client";

import { useCallback, useEffect, useState } from "react";
import { count, dateTimeNl, timeAgoNl } from "@/lib/admin/format";
import { Empty, KpiStrip, Notice, Panel, Pill } from "@/components/admin/kit";

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

  if (!d) return <div className="a-panel h-28 animate-pulse" />;
  const { settings } = d;
  const onCount = d.actions.filter((a) => !settings.disabled.includes(a.key)).length;
  const last = d.log[0] ?? null;
  const failed = d.log.filter((l) => !l.ok).length;
  const handled = d.log.reduce((n, l) => n + l.count, 0);

  return (
    <div className="space-y-4">
      <section className="a-panel flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={settings.enabled} disabled={busy !== null} onChange={(e) => void save(e.target.checked, settings.disabled)} className="h-5 w-5" style={{ accentColor: "var(--a-accent)" }} />
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
              Autopilot <Pill tone={settings.enabled ? "ok" : "neutral"}>{settings.enabled ? "Aan" : "Uit"}</Pill>
            </span>
            <span className="mt-0.5 block text-xs" style={{ color: "var(--a-mute)" }}>Draait elke ochtend en middag vanzelf. {d.consentTenants} organisatie(s) lieten uren automatisch goedkeuren.</span>
          </span>
        </label>
        <button type="button" disabled={busy !== null} onClick={() => void run()} className="a-button a-button-primary">{busy === "all" ? "Bezig…" : "Nu draaien"}</button>
      </section>

      {msg && <Notice>{msg}</Notice>}

      <KpiStrip
        items={[
          { label: "Taken aan", value: `${onCount} van ${d.actions.length}`, hint: settings.enabled ? "draaien vanzelf" : "autopilot staat uit" },
          { label: "Laatste ronde", value: last ? timeAgoNl(last.at) : "Nog niet", hint: last ? (last.ok ? "zonder fouten" : "met een fout") : "draai de eerste ronde" },
          { label: "Afgehandeld", value: count(handled), hint: "in het logboek" },
          { label: "Mislukt", value: count(failed), hint: failed > 0 ? "bekijk het logboek" : "alles ging goed", ...(failed > 0 ? { tone: "crit" as const } : {}) },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Panel flush title="Wat de AI zelf doet" subtitle="Zet een taak uit of draai hem nu meteen">
          <ul>
            {d.actions.map((a) => {
              const on = !settings.disabled.includes(a.key);
              return (
                <li key={a.key} className="flex items-start gap-3 px-4 py-3 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy !== null}
                    onChange={(e) => void save(settings.enabled, e.target.checked ? settings.disabled.filter((k) => k !== a.key) : [...settings.disabled, a.key])}
                    aria-label={`${a.label} aan of uit`}
                    className="mt-0.5 h-4 w-4 flex-shrink-0"
                    style={{ accentColor: "var(--a-accent)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
                      {a.label}
                      <Pill tone={a.tier === "auto" ? "ok" : "warn"}>{a.tier === "auto" ? "Volautomatisch" : "Met toestemming opdrachtgever"}</Pill>
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>{a.description} Max {a.cap} per ronde.</p>
                  </div>
                  <button type="button" disabled={busy !== null || !on} onClick={() => void run([a.key])} className="a-button flex-shrink-0 text-xs">{busy === a.key ? "Bezig…" : "Draai"}</button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel flush title="Logboek" subtitle="Wat de autopilot echt deed">
          {d.log.length === 0 ? (
            <Empty title="Nog niets gedraaid" body="Zodra de autopilot draait, zie je hier elke stap." />
          ) : (
            <ul className="max-h-[36rem] overflow-y-auto">
              {d.log.map((l, i) => (
                <li key={i} className="px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={l.ok ? "ok" : "crit"}>{l.ok ? "Gelukt" : "Mislukt"}</Pill>
                    <span className="font-medium" style={{ color: "var(--a-text)" }}>{d.actions.find((a) => a.key === l.action)?.label ?? l.action}</span>
                    <span className="ml-auto text-xs" style={{ color: "var(--a-mute)" }}>{dateTimeNl(l.at)}, {l.trigger}</span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--a-dim)" }}>{l.summary}</p>
                  {l.details && l.details.length > 0 && (
                    <details className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
                      <summary className="cursor-pointer">Details</summary>
                      <ul className="mt-1 list-disc pl-5">
                        {l.details.map((x, j) => <li key={j}>{x}</li>)}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
