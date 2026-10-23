"use client";

import { useEffect, useState } from "react";
import { AreaChart } from "@/components/admin/charts";
import { money } from "@/components/app/ui";

interface Stats {
  grossVolumeCents: number;
  grossVolumeChangePct: number;
  workedHours: number;
  activeFreelancersToday: number;
  fulfillmentRate: number;
  shiftsFilled: number;
  shiftsTotal: number;
  dbaRiskFlags: number;
  compliancePct: number;
  series: { date: string; revenueCents: number; hours: number }[];
  activity: { at: string; kind: string; text: string }[];
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

/** Card in the clean Shopify style: white, rounded, soft shadow. */
function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: React.ReactNode; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className="rounded-xl border border-hair bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
      <p className="text-xs font-medium text-neutralx-500">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink">{value}</p>
      {sub && <p className={`mt-1 text-xs ${tone === "up" ? "text-brand-700" : tone === "down" ? "text-crit" : "text-neutralx-500"}`}>{sub}</p>}
    </div>
  );
}

export function DashboardHero() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    let on = true;
    const load = () =>
      fetch("/api/admin/dashboard", { cache: "no-store" })
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

  if (!s) return <div className="mb-8 h-40 animate-pulse rounded-xl bg-paper-soft" />;

  const change = s.grossVolumeChangePct;
  return (
    <section className="mb-8 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Omzet (7 dagen)"
          value={money(s.grossVolumeCents)}
          tone={change >= 0 ? "up" : "down"}
          sub={<>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}% t.o.v. vorige week</>}
        />
        <Kpi label="Gewerkte uren (7 dagen)" value={`${s.workedHours} uur`} sub={`${s.activeFreelancersToday} actieve flexwerkers vandaag`} />
        <Kpi
          label="Plaatsingsratio (30 dagen)"
          value={`${(s.fulfillmentRate * 100).toFixed(1)}%`}
          sub={`${s.shiftsFilled} van ${s.shiftsTotal} klussen vervuld`}
        />
        <Kpi
          label="Wet DBA-compliance"
          value={`${s.compliancePct}%`}
          tone={s.dbaRiskFlags === 0 ? "up" : "down"}
          sub={s.dbaRiskFlags === 0 ? "0 risico-vlaggen actief" : `${s.dbaRiskFlags} risico-vlag(gen) actief`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-hair bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06)] lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-semibold text-ink">Omzet &amp; gewerkte uren — laatste 30 dagen</p>
            <p className="text-xs text-neutralx-400">dagelijks</p>
          </div>
          <AreaChart data={s.series.map((d) => d.revenueCents / 100)} height={150} labels={s.series.map((d) => d.date.slice(5))} />
          <div className="mt-2 flex gap-4 text-xs text-neutralx-500">
            <span>Totaal omzet: {money(s.series.reduce((a, d) => a + d.revenueCents, 0))}</span>
            <span>Totaal uren: {Math.round(s.series.reduce((a, d) => a + d.hours, 0))}</span>
          </div>
        </div>

        <div className="rounded-xl border border-hair bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
          <p className="mb-3 text-sm font-semibold text-ink">Live activiteit</p>
          {s.activity.length === 0 ? (
            <p className="text-xs text-neutralx-400">Nog geen recente activiteit.</p>
          ) : (
            <ul className="space-y-2.5">
              {s.activity.slice(0, 8).map((a, i) => (
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
