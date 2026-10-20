"use client";

import { useEffect, useState } from "react";
import { APanel, AStat } from "@/components/admin/ui";
import type { LiveSnapshot } from "@/lib/analytics/live";

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`);
const ROLE: Record<string, { label: string; color: string }> = {
  anoniem: { label: "Nog geen account", color: "#94a3b8" },
  freelancer: { label: "Freelancer (ingelogd)", color: "#4ade80" },
  bedrijf: { label: "Bedrijf (ingelogd)", color: "#60a5fa" },
};
const NUDGE: Record<string, string> = {
  bedrijf: "Bedrijf: 'Vandaag nog iemand nodig?'",
  werk: "Werk: 'klussen wachten op je'",
  exit: "Bijna weg: 'gratis, ook zonder KVK'",
};

/** Who is on the site right now, how long they really look, and what makes them leave. */
export function LiveAttention() {
  const [d, setD] = useState<LiveSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/admin/analytics/attention", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((x) => alive && x && setD(x))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const who = d?.today.who ?? {};
  const totalWho = Object.values(who).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AStat label="Nu op de site" value={d?.active.length ?? "–"} sub="laatste 90 sec" />
        <AStat label="Unieke bezoekers vandaag" value={d?.today.visitors ?? "–"} />
        <AStat label="Zonder account vandaag" value={who.anoniem ?? 0} sub={`${Math.round(((who.anoniem ?? 0) / totalWho) * 100)}% van de bezoeken`} />
        <AStat label="Ingelogd vandaag" value={(who.freelancer ?? 0) + (who.bedrijf ?? 0)} sub={`${who.freelancer ?? 0} freelancer · ${who.bedrijf ?? 0} bedrijf`} />
      </div>

      <APanel title="Live: wie kijkt nu waar, en hoe lang" subtitle="anoniem · zonder cookies · alleen zichtbare tijd telt">
        {d && d.active.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {d.active.map((v) => {
              const r = ROLE[v.role] ?? ROLE.anoniem!;
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span className="flex items-center gap-2" style={{ minWidth: 190 }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                    <span>{r.label}</span>
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{v.path}</span>
                  <span className="text-xs" style={{ color: "var(--a-mute)" }}>
                    {v.hidden ? "⏸ tab weggeklikt" : `▶ ${fmt(Math.round(v.visibleMs / 1000))} gekeken`} · {fmt(v.onPageSec)} op pagina · {v.pages} pagina{v.pages === 1 ? "" : "'s"} · {v.device} · via {v.source}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-4 text-sm" style={{ color: "var(--a-mute)" }}>
            Er is op dit moment niemand op de site.
          </p>
        )}
      </APanel>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <APanel title="Aandacht per pagina (vandaag)" subtitle="gemiddelde kijktijd · % dat hier de site verliet · keer tab weggeklikt">
          {d && d.today.pages.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--a-mute)" }}>
                  <th className="py-1.5 font-medium">Pagina</th>
                  <th className="py-1.5 text-right font-medium">Bekeken</th>
                  <th className="py-1.5 text-right font-medium">Gem. tijd</th>
                  <th className="py-1.5 text-right font-medium">Verlaten</th>
                  <th className="py-1.5 text-right font-medium">Tab weg</th>
                </tr>
              </thead>
              <tbody>
                {d.today.pages.map((p) => (
                  <tr key={p.path} className="border-t" style={{ borderColor: "var(--a-border)" }}>
                    <td className="max-w-[16rem] truncate py-1.5 font-mono text-xs">{p.path}</td>
                    <td className="py-1.5 text-right">{p.views}</td>
                    <td className="py-1.5 text-right">{fmt(p.avgSec)}</td>
                    <td className="py-1.5 text-right" style={{ color: p.exitRate >= 60 ? "#f87171" : undefined }}>
                      {p.exitRate}%
                    </td>
                    <td className="py-1.5 text-right">{p.away}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-4 text-sm" style={{ color: "var(--a-mute)" }}>Nog geen bezoek vandaag.</p>
          )}
        </APanel>
        <div className="space-y-4">
          <APanel title="Waar komen ze vandaan" subtitle="vandaag">
            <ul className="space-y-1.5 text-sm">
              {(d?.today.sources ?? []).map((s) => (
                <li key={s.source} className="flex justify-between">
                  <span>{s.source}</span>
                  <span style={{ color: "var(--a-mute)" }}>{s.visits}</span>
                </li>
              ))}
            </ul>
          </APanel>
          <APanel title="Triggers voor bezoekers zonder account" subtitle="vandaag getoond → geklikt">
            {d && d.today.nudges.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {d.today.nudges.map((n) => (
                  <li key={n.id} className="flex justify-between gap-3">
                    <span>{NUDGE[n.id] ?? n.id}</span>
                    <span style={{ color: "var(--a-mute)" }}>
                      {n.shown} → {n.clicks} ({n.shown ? Math.round((n.clicks / n.shown) * 100) : 0}%)
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog niet getoond vandaag.</p>
            )}
          </APanel>
        </div>
      </section>
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        Geslacht of andere persoonskenmerken worden bewust niet geraden: dat is onbetrouwbaar en mag volgens de AVG niet zonder toestemming.
      </p>
    </div>
  );
}
