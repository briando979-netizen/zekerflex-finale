"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface TriageItem {
  id: string;
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  href: string;
  at: string;
}
interface Kpi {
  key: string;
  label: string;
  series: number[];
  total: number;
  deltaPct: number | null;
}

const SEV: Record<string, string> = {
  high: "border-l-crit",
  medium: "border-l-warn",
  low: "border-l-hairstrong",
};

function Spark({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 96;
  const h = 28;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} className="text-brand-500">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) * step} cy={h - (data[data.length - 1]! / max) * (h - 4) - 2} r="2" fill="currentColor" />
    </svg>
  );
}

export function TriageBoard() {
  const [triage, setTriage] = useState<TriageItem[] | null>(null);
  const [kpis, setKpis] = useState<Kpi[]>([]);

  useEffect(() => {
    const load = () =>
      fetch("/api/admin/overview-plus", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            setTriage(d.triage);
            setKpis(d.kpis);
          }
        })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(kpis.length ? kpis : Array.from({ length: 4 })).map((k, i) => (
          <div key={i} className="card p-4">
            {k ? (
              <>
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutralx-500">{(k as Kpi).label}</span>
                  {(k as Kpi).deltaPct !== null && (
                    <span className={`text-xs font-semibold ${(k as Kpi).deltaPct! >= 0 ? "text-ok" : "text-crit"}`}>
                      {(k as Kpi).deltaPct! >= 0 ? "+" : ""}
                      {(k as Kpi).deltaPct}%
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <span className="num font-display text-2xl font-bold">
                    {(k as Kpi).key === "payouts" || (k as Kpi).key === "revenue" ? "€ " : ""}
                    {(k as Kpi).total.toLocaleString("nl-NL")}
                  </span>
                  <Spark data={(k as Kpi).series} />
                </div>
              </>
            ) : (
              <div className="h-16 animate-pulse rounded bg-paper-200" />
            )}
          </div>
        ))}
      </div>

      {/* Triage */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-hair px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Actie vereist</h2>
          {triage && (
            <span className="text-xs text-neutralx-400">
              {triage.filter((t) => t.severity === "high").length} urgent · {triage.length} totaal
            </span>
          )}
        </div>
        {triage === null ? (
          <div className="space-y-px">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-paper-soft" />
            ))}
          </div>
        ) : triage.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutralx-400">Niks openstaand. Alles onder controle.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {triage.map((t) => (
              <li key={t.id}>
                <Link href={t.href} className={`flex items-center gap-3 border-l-2 ${SEV[t.severity]} px-4 py-3 hover:bg-paper-soft`}>
                  <span className="w-20 flex-shrink-0 font-mono text-[10px] uppercase tracking-wide text-neutralx-400">{t.kind}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
                    <span className="block truncate text-xs text-neutralx-500">{t.detail}</span>
                  </span>
                  <span className="flex-shrink-0 text-xs text-neutralx-400">
                    {new Date(t.at).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
