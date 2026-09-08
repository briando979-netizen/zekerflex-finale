"use client";

import { useCallback, useEffect, useState } from "react";
import { APanel, AStat, APill } from "@/components/admin/ui";
import { IRocket, IMail, IClock, IActivity } from "@/components/app/icons";

export type EngineRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  discovered: number;
  enriched: number;
  scored: number;
  drafted: number;
  sent: number;
  skipped: number;
  summary: string | null;
};

export type EngineSnapshot = {
  config: {
    engineEnabled: boolean;
    autopilotEnabled: boolean;
    globalDailyCap: number;
    tickMinutes: number;
  };
  paused: boolean;
  sentToday: number;
  queuedForReview: number;
  scheduled: { id: string; companyName: string; nextActionAt: string | null; sequenceStep: number }[];
  runs: EngineRun[];
};

function fmt(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
}

export function EngineTab({ initial }: { initial: EngineSnapshot }) {
  const [snap, setSnap] = useState<EngineSnapshot>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await fetch("/api/admin/sales/engine", { cache: "no-store" });
    if (r.ok) setSnap(await r.json());
  }, []);

  useEffect(() => {
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [reload]);

  async function post(action: "pause" | "resume" | "run") {
    setBusy(action);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/sales/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg(d?.error?.message ?? "Actie mislukt.");
        return;
      }
      if (action === "run" && d.result) {
        const x = d.result;
        setMsg(
          typeof x.skipped === "string"
            ? `Overgeslagen: ${x.skipped}`
            : `Gedraaid: ${x.discovered} ontdekt, ${x.scored} gescoord, ${x.drafted} concept, ${x.sent} verzonden.`,
        );
      } else {
        setMsg("Bijgewerkt.");
      }
      await reload();
    } finally {
      setBusy(null);
    }
  }

  const { config } = snap;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AStat label="Vandaag verstuurd" value={`${snap.sentToday} / ${config.globalDailyCap}`} icon={<IMail />} sub="globale dagcap" />
        <AStat label="Wacht op review" value={snap.queuedForReview} icon={<IClock />} sub="concepten klaar" />
        <AStat label="Gepland" value={snap.scheduled.length} icon={<IActivity />} sub="volgende stappen" />
        <AStat label="Motor" value={snap.paused ? "gepauzeerd" : config.engineEnabled ? "actief" : "uit"} icon={<IRocket />} />
      </div>

      <APanel title="Bediening" subtitle="Kill-switch + handmatige run">
        <div className="flex flex-wrap items-center gap-3">
          {snap.paused ? (
            <button type="button" onClick={() => post("resume")} disabled={busy !== null}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              style={{ background: "var(--a-accent)", color: "#04140d", border: "1px solid var(--a-border)" }}>
              {busy === "resume" ? "Bezig…" : "Motor hervatten"}
            </button>
          ) : (
            <button type="button" onClick={() => post("pause")} disabled={busy !== null}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              style={{ background: "rgba(248,113,113,0.15)", color: "#fca5a5", border: "1px solid var(--a-border)" }}>
              {busy === "pause" ? "Bezig…" : "Noodstop (pauzeren)"}
            </button>
          )}
          <button type="button" onClick={() => post("run")} disabled={busy !== null}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
            style={{ background: "var(--a-panel)", color: "var(--a-dim)", border: "1px solid var(--a-border)" }}>
            {busy === "run" ? "Bezig…" : "Nu draaien (alle actieve campagnes)"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <APill tone={config.engineEnabled ? "ok" : "crit"}>SALES_ENGINE_ENABLED = {String(config.engineEnabled)}</APill>
          <APill tone={config.autopilotEnabled ? "warn" : "neutral"}>SALES_AUTOPILOT_ENABLED = {String(config.autopilotEnabled)}</APill>
          <APill tone="neutral">tick ~{config.tickMinutes} min</APill>
        </div>

        {msg && <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>{msg}</p>}
      </APanel>

      <APanel title="Eerstvolgende geplande stappen" pad={false}>
        {snap.scheduled.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: "var(--a-mute)" }}>Niets gepland.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {snap.scheduled.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-xs" style={{ color: "var(--a-dim)" }}>
                <span>{s.companyName} · stap {s.sequenceStep + 1}</span>
                <span style={{ color: "var(--a-mute)" }}>{fmt(s.nextActionAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </APanel>

      <APanel title="Recente runs" pad={false}>
        {snap.runs.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: "var(--a-mute)" }}>Nog geen runs.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {snap.runs.map((run) => (
              <li key={run.id} className="px-5 py-3 text-xs" style={{ color: "var(--a-dim)" }}>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--a-mute)" }}>{fmt(run.startedAt)}</span>
                  <span>
                    {run.discovered}▸ · {run.scored}✓ · {run.drafted}✎ · <strong style={{ color: "var(--a-text)" }}>{run.sent}✉</strong>
                    {run.skipped ? ` · ${run.skipped}⤫` : ""}
                  </span>
                </div>
                {run.summary && <p className="mt-1" style={{ color: "var(--a-mute)" }}>{run.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </APanel>
    </div>
  );
}
