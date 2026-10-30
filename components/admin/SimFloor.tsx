"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { APanel } from "@/components/admin/ui";
import { JarvisConsole } from "@/components/jarvis/JarvisConsole";

// ---------------------------------------------------------------------------
// The "Sim" — a floor-plan view of the same real autonomous systems the
// Control Center already tracks (/api/admin/overview's `agents` +
// `recentFindings`, and the background cron jobs from scripts/daemon.mjs via
// /api/admin/cron-status), presented as departments instead of a metrics
// table. Nothing here is invented: every room's status light, last-activity
// line and finding comes from the real data those two endpoints already
// serve to the Control Center. "Send a message to the head AI" opens the
// real Jarvis console (components/jarvis/JarvisConsole.tsx) in place —
// there's no separate fake chat here.
// ---------------------------------------------------------------------------

interface Overview {
  agents: { agent: string; lastTitle: string; at: string }[];
  recentFindings: { severity: string; category: string; title: string; createdAt: string }[];
  runningTurns: number;
}

interface CronJob {
  job: string;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
}

const ROOMS: { agent: string; label: string; desk: string; href: string; hrefLabel: string }[] = [
  { agent: "jarvis", label: "ZekerFlex AI — Hoofdkantoor", desk: "Orchestrator, delegeert naar de andere afdelingen", href: "/admin/zekerflex-ai", hrefLabel: "ZekerFlex AI-studio" },
  { agent: "analyst", label: "Analyst", desk: "Leest elke cyclus de platformstatus en meldt bevindingen", href: "/admin/zekerflex-ai", hrefLabel: "Bevindingen in ZekerFlex AI" },
  { agent: "developer:tom", label: "Developer · Tom", desk: "Stelt codepatches voor — iemand moet ze zelf toepassen", href: "/admin/zekerflex-ai", hrefLabel: "Voorstellen bekijken" },
  { agent: "sales", label: "Sales", desk: "Autonome leadwerving en wervingscampagnes, met harde caps", href: "/admin/sales", hrefLabel: "Sales-dashboard" },
];

const JOB_LABEL: Record<string, string> = {
  "ai-watchdog": "AI-watchdog",
  "matching-tick": "Matching",
  "active-hours": "Actieve uren",
  "sales-motor": "Sales-motor",
  orchestration: "Orchestration",
  "rag-reindex": "Geheugen-index",
  "retention-sweep": "Retentie",
  "abu-phase-sweep": "ABU-fase",
  "no-show-sweep": "No-show",
  "claim-collections-sweep": "Incasso",
};

function isActive(atIso: string | undefined): boolean {
  return Boolean(atIso && Date.now() - new Date(atIso).getTime() < 90_000);
}

export function SimFloor() {
  const [o, setO] = useState<Overview | null>(null);
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [openRoom, setOpenRoom] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [ov, cr] = await Promise.all([
        fetch("/api/admin/overview", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/admin/cron-status", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (ov) setO(ov);
      if (cr) setJobs(cr.jobs);
    };
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-2xl p-6"
        style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}
      >
        <h1 className="font-display text-2xl font-bold" style={{ color: "var(--a-text)" }}>
          De Sim — kantoorvloer
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--a-mute)" }}>
          Elke kamer is een echt autonoom onderdeel van ZekerFlex, geen simulatie met verzonnen data. Klik een kamer
          open om te zien wat er nu speelt, of stuur een bericht naar Jarvis.
        </p>
        <Link href="/admin" className="mt-3 inline-block text-xs" style={{ color: "var(--a-accent-ink)" }}>
          ← Terug naar het controlecentrum
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ROOMS.map((room) => {
          const row = o?.agents.find((r) => r.agent === room.agent);
          const active = isActive(row?.at);
          const open = openRoom === room.agent;
          return (
            <div
              key={room.agent}
              className="overflow-hidden rounded-2xl"
              style={{ background: "var(--a-panel)", border: `1px solid ${active ? "rgba(16,185,129,0.4)" : "var(--a-border)"}` }}
            >
              <button
                type="button"
                onClick={() => setOpenRoom(open ? null : room.agent)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                    <span className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-emerald-400" : ""}`} style={active ? {} : { background: "var(--a-mute)" }} />
                    {room.label}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>{room.desk}</p>
                  <p className="mt-2 truncate text-xs" style={{ color: "var(--a-dim)" }}>
                    {row ? `Laatst: ${row.lastTitle}` : "Nog geen activiteit in deze sessie"}
                  </p>
                </div>
                <span style={{ color: "var(--a-mute)" }}>{open ? "–" : "+"}</span>
              </button>

              {open && (
                <div className="border-t p-4" style={{ borderColor: "var(--a-border)" }}>
                  {room.agent === "jarvis" ? (
                    <div className="max-h-[560px] overflow-hidden rounded-xl" style={{ border: "1px solid var(--a-border)" }}>
                      <JarvisConsole />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                        Alleen Jarvis heeft een eigen chat — deze afdeling krijgt taken via Jarvis&apos;
                        delegatie. Bekijk de details daar, of in het eigen dashboard.
                      </p>
                      <Link href={room.href} className="text-xs font-semibold" style={{ color: "var(--a-accent-ink)" }}>
                        {room.hrefLabel} →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <APanel title="Achtergronddiensten" subtitle="Draaien 24/7 op een vaste cadans, geen menselijke trigger nodig">
        {!jobs ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {jobs.map((j) => (
              <div key={j.job} className="rounded-xl p-3" style={{ background: "var(--a-panel-2)", border: "1px solid var(--a-border)" }}>
                <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--a-text)" }}>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: j.lastRunOk === null ? "var(--a-mute)" : j.lastRunOk ? "#4ade80" : "#f87171" }}
                  />
                  {JOB_LABEL[j.job] ?? j.job}
                </div>
                <p className="mt-1 text-[11px]" style={{ color: "var(--a-mute)" }}>
                  {j.lastRunAt ? new Date(j.lastRunAt).toLocaleTimeString("nl-NL") : "nog niet gedraaid"}
                </p>
              </div>
            ))}
          </div>
        )}
      </APanel>

      <APanel title="Recente bevindingen" subtitle="Van de analist, platformbreed">
        {o && o.recentFindings.length > 0 ? (
          <ul className="space-y-2">
            {o.recentFindings.slice(0, 8).map((f, i) => (
              <li key={i} className="text-xs" style={{ color: "var(--a-dim)" }}>
                <span className="font-semibold" style={{ color: "var(--a-text)" }}>{f.category}</span> — {f.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Geen open bevindingen.</p>
        )}
      </APanel>
    </div>
  );
}
