"use client";

import { useEffect, useState } from "react";
import { AreaChart } from "@/components/admin/charts";
import { money } from "@/components/app/ui";

interface Stats {
  spentCents: number;
  spentChangePct: number;
  workedHours: number;
  activeWorkersToday: number;
  fillRate: number;
  shiftsFilled: number;
  shiftsTotal: number;
  hoursToApprove: number;
  series: { date: string; spentCents: number; hours: number }[];
  activity: { at: string; text: string }[];
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "zojuist";
  if (m < 60) return `${m} min geleden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} uur geleden`;
  return `${Math.floor(h / 24)} dag(en) geleden`;
}

function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: React.ReactNode; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className="rounded-xl border border-hair bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
      <p className="text-xs font-medium text-neutralx-500">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink">{value}</p>
      {sub && <p className={`mt-1 text-xs ${tone === "up" ? "text-brand-700" : tone === "down" ? "text-crit" : "text-neutralx-500"}`}>{sub}</p>}
    </div>
  );
}

export function EmployerDashboardHero() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    let on = true;
    const load = () =>
      fetch("/api/werkgever/dashboard", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => on && d && setS(d))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);

  if (!s) return <div className="mb-6 h-40 animate-pulse rounded-xl bg-paper-soft" />;

  return (
    <section className="mb-8 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Uitgegeven (7 dagen)" value={money(s.spentCents)} tone={s.spentChangePct >= 0 ? "neutral" : "up"} sub={<>{s.spentChangePct >= 0 ? "▲" : "▼"} {Math.abs(s.spentChangePct)}% t.o.v. vorige week</>} />
        <Kpi label="Gewerkte uren (7 dagen)" value={`${s.workedHours} uur`} sub={`${s.activeWorkersToday} flexwerker(s) vandaag aan het werk`} />
        <Kpi label="Bezetting (30 dagen)" value={`${(s.fillRate * 100).toFixed(0)}%`} sub={`${s.shiftsFilled} van ${s.shiftsTotal} klussen vol`} />
        <Kpi label="Uren te keuren" value={String(s.hoursToApprove)} tone={s.hoursToApprove === 0 ? "up" : "down"} sub={s.hoursToApprove === 0 ? "alles bijgewerkt" : "wachten op je goedkeuring"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-hair bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06)] lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-semibold text-ink">Uitgaven &amp; gewerkte uren — laatste 30 dagen</p>
            <p className="text-xs text-neutralx-400">dagelijks</p>
          </div>
          <AreaChart data={s.series.map((d) => d.spentCents / 100)} height={150} labels={s.series.map((d) => d.date.slice(5))} />
        </div>

        <div className="rounded-xl border border-hair bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
          <p className="mb-3 text-sm font-semibold text-ink">Live activiteit</p>
          {s.activity.length === 0 ? (
            <p className="text-xs text-neutralx-400">Nog geen recente activiteit.</p>
          ) : (
            <ul className="space-y-2.5">
              {s.activity.map((a, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span className="min-w-0">
                    <span className="text-ink">{a.text}</span>
                    <span className="block text-neutralx-400">{timeAgo(a.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
