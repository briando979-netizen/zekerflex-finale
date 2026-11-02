"use client";

import type { LiveSnapshot } from "@/lib/analytics/live";
import { count } from "@/lib/admin/format";
import { BarList, Empty, Panel, Pill } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`);
const ROLE: Record<string, { label: string; tone: "neutral" | "ok" | "plan" }> = {
  anoniem: { label: "Nog geen account", tone: "neutral" },
  freelancer: { label: "Freelancer", tone: "ok" },
  bedrijf: { label: "Bedrijf", tone: "plan" },
};
const NUDGE: Record<string, string> = {
  bedrijf: "Bedrijf: 'Vandaag nog iemand nodig?'",
  werk: "Werk: 'klussen wachten op je'",
  exit: "Bijna weg: 'gratis, ook zonder KVK'",
};

/** Who is on the site right now, how long they really look, and what makes them leave. */
export function LiveAttention({ d }: { d: LiveSnapshot | null }) {
  const pageRows: TableRow[] = (d?.today.pages ?? []).map((p) => ({
    id: p.path,
    search: p.path,
    cells: {
      path: <span className="font-mono text-xs" style={{ color: "var(--a-text)" }}>{p.path}</span>,
      views: count(p.views),
      avg: fmt(p.avgSec),
      exit: <span style={p.exitRate >= 60 ? { color: "var(--a-crit)", fontWeight: 500 } : undefined}>{p.exitRate}%</span>,
      away: count(p.away),
    },
    sort: { path: p.path, views: p.views, avg: p.avgSec, exit: p.exitRate, away: p.away },
  }));

  return (
    <>
      <Panel flush title="Live: wie kijkt nu waar, en hoe lang" subtitle="Anoniem, zonder cookies. Alleen zichtbare tijd telt.">
        {d && d.active.length > 0 ? (
          <ul>
            {d.active.map((v) => {
              const r = ROLE[v.role] ?? ROLE.anoniem!;
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <span className="w-40 flex-shrink-0"><Pill tone={r.tone}>{r.label}</Pill></span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" style={{ color: "var(--a-text)" }}>{v.path}</span>
                  <span className="text-xs" style={{ color: "var(--a-mute)" }}>
                    {v.hidden ? "tab weggeklikt" : `${fmt(Math.round(v.visibleMs / 1000))} gekeken`}, {fmt(v.onPageSec)} op de pagina, {v.pages} {v.pages === 1 ? "pagina" : "pagina's"}, {v.device}, via {v.source}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="Er is nu niemand op de site" body="Zodra iemand de site bezoekt, zie je hier waar en hoe lang." />
        )}
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel flush title="Aandacht per pagina" subtitle="Vandaag: gemiddelde kijktijd, hoeveel procent hier de site verliet en hoe vaak de tab werd weggeklikt">
          <DataTable
            columns={[
              { key: "path", label: "Pagina" },
              { key: "views", label: "Bekeken", align: "right" },
              { key: "avg", label: "Gem. tijd", align: "right" },
              { key: "exit", label: "Verlaten", align: "right" },
              { key: "away", label: "Tab weg", align: "right", hideOnMobile: true },
            ]}
            rows={pageRows}
            pageSize={10}
            defaultSort={{ key: "views", dir: "desc" }}
            emptyText="Nog geen bezoek vandaag."
          />
        </Panel>
        <div className="space-y-4">
          <Panel title="Waar komen ze vandaan" subtitle="Vandaag">
            <BarList emptyText="Nog geen bezoek vandaag." rows={(d?.today.sources ?? []).map((s) => ({ key: s.source, label: s.source, value: s.visits, display: count(s.visits) }))} />
          </Panel>
          <Panel flush title="Triggers voor bezoekers zonder account" subtitle="Vandaag getoond en aangeklikt">
            {d && d.today.nudges.length > 0 ? (
              <ul>
                {d.today.nudges.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                    <span style={{ color: "var(--a-dim)" }}>{NUDGE[n.id] ?? n.id}</span>
                    <span className="num flex-shrink-0 text-xs" style={{ color: "var(--a-mute)" }}>
                      {count(n.shown)} getoond, {count(n.clicks)} geklikt ({n.shown ? Math.round((n.clicks / n.shown) * 100) : 0}%)
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-[0.8125rem] sm:px-5" style={{ color: "var(--a-mute)" }}>Nog niet getoond vandaag.</p>
            )}
          </Panel>
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        Geslacht of andere persoonskenmerken worden bewust niet geraden: dat is onbetrouwbaar en mag volgens de AVG niet zonder toestemming.
      </p>
    </>
  );
}
