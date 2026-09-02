"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TriageBoard } from "@/components/admin/TriageBoard";
import { AStat, APanel } from "@/components/admin/ui";
import { RingGauge, AreaChart } from "@/components/admin/charts";
import {
  IActivity,
  IChat,
  IPulse,
  IShield,
  IUsers,
  IWallet,
} from "@/components/app/icons";

interface Overview {
  at: string;
  health: {
    database: boolean;
    cache: boolean;
    llm: { ok: boolean; model: string; local: boolean };
    webPush: boolean;
  };
  ai: {
    tokensToday: number;
    tokenBudget: number;
    concurrencyInUse: number;
    concurrencyMax: number;
    requestsThisMinute: number;
  };
  queues: {
    openDisputes: number;
    timesheetsToApprove: number;
    staleOpenShifts: number;
    failedPayments: number;
    openFindings: number;
  };
  traffic: { activeVisitors: number; pageviewsToday: number; visitorsToday: number };
  agents: { agent: string; lastTitle: string; at: string }[];
  recentFindings: { severity: string; category: string; title: string; createdAt: string }[];
  voiceQueued: number;
  ragChunks: number;
  runningTurns: number;
}

const AGENT_LABEL: Record<string, string> = {
  jarvis: "Jarvis",
  analyst: "Analyst",
  "developer:tom": "Developer · Tom",
  sales: "Sales",
};

export function ControlCenter() {
  const [o, setO] = useState<Overview | null>(null);
  const [stale, setStale] = useState(false);
  const [clock, setClock] = useState("");
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/admin/overview", { cache: "no-store" });
        if (res.ok) {
          const data: Overview = await res.json();
          setO(data);
          setStale(false);
          setHistory((h) => [...h, data.traffic.activeVisitors].slice(-40));
        } else setStale(true);
      } catch {
        setStale(true);
      }
    };
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  const dateStr = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const healthUp = o
    ? [o.health.database, o.health.cache, o.health.llm.ok, o.health.webPush].filter(Boolean).length
    : 0;
  const healthPct = o ? (healthUp / 4) * 100 : 0;
  const budgetPct = o && o.ai.tokenBudget ? Math.min(100, (o.ai.tokensToday / o.ai.tokenBudget) * 100) : 0;
  const slotsPct = o && o.ai.concurrencyMax ? (o.ai.concurrencyInUse / o.ai.concurrencyMax) * 100 : 0;
  // Seed the live chart with a flat baseline so it reads well before enough
  // samples have streamed in; it then animates as real data arrives.
  const seed = history[0] ?? o?.traffic.activeVisitors ?? 0;
  const area = history.length >= 6 ? history : [...Array(6 - history.length).fill(seed), ...history];

  return (
    <div className="space-y-4">
      {/* Greeting hero */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 lg:p-7"
        style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}
      >
        <span
          className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,0.22), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-2xl font-bold" style={{ color: "var(--a-text)" }}>
              Controlecentrum
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--a-mute)" }}>
              Bewaak alle metrics en beheer het platform — The Sovereign Box.
            </p>
            <p className="num mt-5 font-display text-4xl font-bold" style={{ color: "var(--a-text)" }}>
              {clock}
            </p>
          </div>
          <div className="text-right">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
              style={{
                background: stale ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
                color: stale ? "#fbbf24" : "#4ade80",
              }}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-amber-400" : "animate-pulse bg-emerald-400"}`} />
              {stale ? "Verbinding traag…" : "Alle systemen operationeel"}
            </span>
            <p className="mt-3 text-sm capitalize" style={{ color: "var(--a-dim)" }}>{dateStr}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>100% lokaal gehost · geen tussenpartijen</p>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AStat
          label="Nu actief"
          value={o?.traffic.activeVisitors ?? "–"}
          icon={<IUsers />}
          sub="bezoekers live"
          watermark={<BigIcon><IUsers /></BigIcon>}
        />
        <AStat
          label="Bezoekers vandaag"
          value={o?.traffic.visitorsToday ?? "–"}
          icon={<IActivity />}
          sub={`${o?.traffic.pageviewsToday ?? 0} pageviews`}
          watermark={<BigIcon><IActivity /></BigIcon>}
        />
        <AStat
          label="AI-tokens vandaag"
          value={o ? fmt(o.ai.tokensToday) : "–"}
          icon={<IChat />}
          trendDir={budgetPct > 90 ? "down" : "flat"}
          watermark={<BigIcon><IChat /></BigIcon>}
          {...(o ? { trend: `${budgetPct.toFixed(0)}% budget` } : {})}
        />
        <AStat
          label="Lopende Jarvis-turns"
          value={o?.runningTurns ?? "–"}
          icon={<IPulse />}
          sub={`${o?.voiceQueued ?? 0} spraak in wachtrij`}
          watermark={<BigIcon><IPulse /></BigIcon>}
        />
      </div>

      <TriageBoard />

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* Left column */}
        <div className="space-y-4">
          <APanel title="Werkvoorraad" subtitle="Wat aandacht nodig heeft">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Open geschillen", o?.queues.openDisputes, o && o.queues.openDisputes > 0],
                ["Urenbriefjes te keuren", o?.queues.timesheetsToApprove, o && o.queues.timesheetsToApprove > 0],
                ["Verlopen open shifts", o?.queues.staleOpenShifts, false],
                ["Mislukte betalingen", o?.queues.failedPayments, o && o.queues.failedPayments > 0],
                ["Open bevindingen", o?.queues.openFindings, o && o.queues.openFindings > 0],
              ].map(([label, val, warn]) => (
                <div
                  key={label as string}
                  className="rounded-xl p-3"
                  style={{
                    background: "var(--a-panel-2)",
                    border: `1px solid ${warn ? "rgba(245,158,11,0.35)" : "var(--a-border)"}`,
                  }}
                >
                  <p className="text-xs" style={{ color: "var(--a-mute)" }}>{label as string}</p>
                  <p
                    className="num mt-1.5 font-display text-xl font-bold"
                    style={{ color: warn ? "#fbbf24" : "var(--a-text)" }}
                  >
                    {val ?? "–"}
                  </p>
                </div>
              ))}
            </div>
          </APanel>

          <APanel title="Verkeer" subtitle="Live bezoekers (bijgewerkt elke 5s)">
            <div style={{ color: "var(--a-text)" }}>
              <AreaChart data={area} height={140} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ["Nu actief", o?.traffic.activeVisitors],
                ["Bezoekers", o?.traffic.visitorsToday],
                ["Pageviews", o?.traffic.pageviewsToday],
              ].map(([l, v]) => (
                <div key={l as string} className="text-center">
                  <p className="num font-display text-lg font-bold" style={{ color: "var(--a-text)" }}>{v ?? "–"}</p>
                  <p className="text-[11px]" style={{ color: "var(--a-mute)" }}>{l as string}</p>
                </div>
              ))}
            </div>
          </APanel>

          <APanel title="Agenten" subtitle="Autonome onderdelen">
            <div className="grid grid-cols-2 gap-2.5">
              {(["jarvis", "analyst", "developer:tom", "sales"] as const).map((a) => {
                const row = o?.agents.find((r) => r.agent === a);
                const active = row && Date.now() - new Date(row.at).getTime() < 90_000;
                return (
                  <div
                    key={a}
                    className="rounded-xl p-3"
                    style={{
                      background: "var(--a-panel-2)",
                      border: `1px solid ${active ? "rgba(16,185,129,0.4)" : "var(--a-border)"}`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "var(--a-text)" }}>
                      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : ""}`} style={active ? {} : { background: "var(--a-mute)" }} />
                      {AGENT_LABEL[a]}
                    </div>
                    <div className="mt-1 truncate text-xs" style={{ color: "var(--a-mute)" }}>{row?.lastTitle ?? "inactief"}</div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px]" style={{ color: "var(--a-mute)" }}>
              {o?.runningTurns ?? 0} lopende turns · {o?.voiceQueued ?? 0} spraakmeldingen · {o?.ragChunks ?? 0} geheugen-fragmenten
            </p>
          </APanel>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <APanel title="Systeemgezondheid" subtitle="Real-time componentstatus">
            <div className="flex items-center gap-5">
              <div style={{ color: "var(--a-text)" }}>
                <RingGauge
                  center={`${healthPct.toFixed(0)}%`}
                  rings={[
                    { value: healthPct, color: "#10b981" },
                    { value: 100 - budgetPct, color: "#60a5fa" },
                    { value: 100 - slotsPct, color: "#8b8b93" },
                  ]}
                />
              </div>
              <div className="flex-1 space-y-2.5">
                {[
                  ["Componenten", healthPct, "#10b981"],
                  ["AI-budget vrij", 100 - budgetPct, "#60a5fa"],
                  ["Rekensloten vrij", 100 - slotsPct, "#8b8b93"],
                ].map(([l, v, c]) => (
                  <div key={l as string} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2" style={{ color: "var(--a-dim)" }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: c as string }} />
                      {l as string}
                    </span>
                    <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{(v as number).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 text-[13px]" style={{ borderColor: "var(--a-border)" }}>
              {[
                ["Database", o?.health.database],
                ["Redis", o?.health.cache],
                ["Lokale AI", o?.health.llm.ok],
                ["Web Push", o?.health.webPush],
              ].map(([l, ok]) => (
                <div key={l as string} className="flex items-center gap-2" style={{ color: "var(--a-dim)" }}>
                  <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
                  {l as string}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px]" style={{ color: "var(--a-mute)" }}>
              Model {o?.health.llm.model ?? "—"} · {o?.ai.requestsThisMinute ?? 0} req/min · {o?.ai.concurrencyInUse ?? 0}/{o?.ai.concurrencyMax ?? 0} sloten
            </p>
          </APanel>

          <APanel title="Recente bevindingen" subtitle="Orchestrator-signalen">
            {o && o.recentFindings.length > 0 ? (
              <ul className="space-y-2.5">
                {o.recentFindings.slice(0, 6).map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={
                        ["HIGH", "CRITICAL"].includes(f.severity)
                          ? { background: "rgba(248,113,113,0.18)", color: "#fca5a5" }
                          : f.severity === "MEDIUM"
                            ? { background: "rgba(245,158,11,0.18)", color: "#fbbf24" }
                            : { background: "var(--a-elev)", color: "var(--a-dim)" }
                      }
                    >
                      {f.severity}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px]" style={{ color: "var(--a-text)" }}>{f.title}</p>
                      <p className="text-[11px]" style={{ color: "var(--a-mute)" }}>{f.category}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: "var(--a-mute)" }}>Geen open bevindingen.</p>
            )}
          </APanel>

          <APanel title="Snel naar" pad={false}>
            <div className="grid gap-1 p-3">
              {(
                [
                  ["Jarvis-console", "/admin/jarvis", <IChat />],
                  ["Wekelijkse verloning", "/admin/verloning", <IWallet />],
                  ["Verkeer & analytics", "/admin/analytics", <IActivity />],
                  ["Disputen", "/admin/disputes", <IShield />],
                ] as const
              ).map(([label, href, icon]) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/5"
                  style={{ color: "var(--a-dim)" }}
                >
                  <span style={{ color: "var(--a-mute)" }}>{icon}</span>
                  {label}
                  <span className="ml-auto" style={{ color: "var(--a-mute)" }}>›</span>
                </Link>
              ))}
            </div>
          </APanel>
        </div>
      </div>
    </div>
  );
}

function BigIcon({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-block", transform: "scale(4.5)", transformOrigin: "bottom right" }}>{children}</span>;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
