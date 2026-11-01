"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { timeAgoNl } from "@/lib/admin/format";
import { Feed, KpiStrip, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { JarvisConsole } from "@/components/jarvis/JarvisConsole";

// ---------------------------------------------------------------------------
// The "Sim" — a floor-plan view of the same real autonomous systems the
// Control Center tracks (/api/admin/overview's `agents` + `recentFindings`, and
// the durable cron heartbeats via /api/admin/cron-status), presented as
// departments instead of a metrics table. Nothing here is invented: every room's
// status, last-activity line and finding comes from those two endpoints.
// "Send a message to the head AI" opens the real Jarvis console
// (components/jarvis/JarvisConsole.tsx) in place — no separate fake chat here.
// ---------------------------------------------------------------------------

interface Overview {
  agents: { agent: string; lastTitle: string; at: string }[];
  recentFindings: { severity: string; category: string; title: string; createdAt: string }[];
  runningTurns: number;
}

interface CronJob {
  job: string;
  label: string;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  stale: boolean;
}

const ROOMS: { agent: string; label: string; desk: string; href: string; hrefLabel: string }[] = [
  { agent: "jarvis", label: "ZekerFlex AI, hoofdkantoor", desk: "Stuurt de andere afdelingen aan", href: "/admin/zekerflex-ai", hrefLabel: "Naar de ZekerFlex AI-studio" },
  { agent: "analyst", label: "Analist", desk: "Leest elke cyclus de platformstatus en meldt bevindingen", href: "/admin/zekerflex-ai", hrefLabel: "Bevindingen in ZekerFlex AI" },
  { agent: "developer:tom", label: "Developer, Tom", desk: "Stelt codepatches voor. Iemand moet ze zelf toepassen", href: "/admin/zekerflex-ai", hrefLabel: "Voorstellen bekijken" },
  { agent: "sales", label: "Sales", desk: "Autonome leadwerving en wervingscampagnes, met harde grenzen", href: "/admin/sales", hrefLabel: "Naar de pijplijn" },
];

const SEVERITY: Record<string, Tone> = { critical: "crit", high: "crit", warning: "warn", medium: "warn" };

function isActive(atIso: string | undefined): boolean {
  return Boolean(atIso && Date.now() - new Date(atIso).getTime() < 90_000);
}

function jobStatus(j: CronJob): { tone: Tone; label: string } {
  if (j.lastRunOk === false) return { tone: "crit", label: "Mislukt" };
  if (j.stale) return { tone: "warn", label: "Te laat" };
  if (j.lastRunAt) return { tone: "ok", label: "Op schema" };
  return { tone: "neutral", label: "Nog niet gezien" };
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

  const activeRooms = ROOMS.filter((room) => isActive(o?.agents.find((r) => r.agent === room.agent)?.at)).length;
  const onSchedule = jobs?.filter((j) => j.lastRunOk !== false && !j.stale && j.lastRunAt).length ?? 0;
  const problems = jobs?.filter((j) => j.lastRunOk === false || j.stale).length ?? 0;

  return (
    <div className="space-y-4">
      <PageHead
        title="De Sim"
        subtitle="Elke kamer is een echt autonoom onderdeel van ZekerFlex, geen simulatie met verzonnen data. Klik een kamer open om te zien wat er speelt, of stuur een bericht naar Jarvis."
      />

      <KpiStrip
        items={[
          { label: "Afdelingen nu bezig", value: `${activeRooms} van ${ROOMS.length}`, hint: "actief in de laatste 90 seconden" },
          { label: "AI-beurten bezig", value: o?.runningTurns ?? "—", hint: "op dit moment" },
          { label: "Taken op schema", value: jobs ? `${onSchedule} van ${jobs.length}` : "—", hint: "achtergronddiensten" },
          { label: "Taken met een probleem", value: jobs ? problems : "—", hint: !jobs ? "laden" : problems > 0 ? "Bekijk ze hieronder" : "Alles loopt", ...(problems > 0 ? { tone: "crit" as const } : {}) },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {ROOMS.map((room) => {
          const row = o?.agents.find((r) => r.agent === room.agent);
          const active = isActive(row?.at);
          const open = openRoom === room.agent;
          return (
            <section key={room.agent} className="a-panel overflow-hidden">
              <button type="button" onClick={() => setOpenRoom(open ? null : room.agent)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-[var(--a-panel-2)] sm:p-5">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                    {room.label}
                    <Pill tone={active ? "ok" : "neutral"}>{active ? "Bezig" : "Rustig"}</Pill>
                  </span>
                  <span className="mt-1 block text-xs" style={{ color: "var(--a-mute)" }}>{room.desk}</span>
                  <span className="mt-2 block truncate text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                    {row ? `Laatst: ${row.lastTitle}, ${timeAgoNl(row.at)}` : "Nog geen activiteit"}
                  </span>
                </span>
                <span className="flex-shrink-0 text-lg leading-none" style={{ color: "var(--a-mute)" }} aria-hidden>{open ? "−" : "+"}</span>
              </button>

              {open && (
                <div className="p-4 sm:p-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  {room.agent === "jarvis" ? (
                    <div className="max-h-[560px] overflow-hidden rounded-xl" style={{ border: "1px solid var(--a-border)" }}>
                      <JarvisConsole />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                        Alleen Jarvis heeft een eigen chat. Deze afdeling krijgt taken via Jarvis. Bekijk de details daar, of in het eigen dashboard.
                      </p>
                      <Link href={room.href} className="text-xs font-semibold hover:underline" style={{ color: "var(--a-accent-ink)" }}>{room.hrefLabel} →</Link>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel flush title="Achtergronddiensten" subtitle="Draaien vanzelf op een vaste cadans">
          {!jobs ? (
            <div className="mx-5 mb-5 h-32 animate-pulse rounded-lg" style={{ background: "var(--a-elev)" }} />
          ) : (
            <ul>
              {jobs.map((j) => {
                const status = jobStatus(j);
                return (
                  <li key={j.job} className="flex items-center justify-between gap-3 px-4 py-2 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                    <span className="min-w-0 truncate font-medium" style={{ color: "var(--a-text)" }}>{j.label}</span>
                    <span className="flex flex-shrink-0 items-center gap-3">
                      <span className="text-xs" style={{ color: "var(--a-mute)" }}>{j.lastRunAt ? timeAgoNl(j.lastRunAt) : "—"}</span>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Recente bevindingen" subtitle="Van de analist, platformbreed">
          <Feed
            emptyText="Geen open bevindingen."
            items={(o?.recentFindings ?? []).slice(0, 8).map((f, i) => ({
              key: `${f.createdAt}-${i}`,
              text: f.title,
              meta: `${f.category}, ${timeAgoNl(f.createdAt)}`,
              ...(SEVERITY[f.severity] ? { tone: SEVERITY[f.severity]! } : {}),
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
