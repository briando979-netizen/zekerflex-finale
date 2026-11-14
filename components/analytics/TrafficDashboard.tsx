"use client";

import { useEffect, useState } from "react";
import type { LiveSnapshot } from "@/lib/analytics/live";
import { count, percentOf } from "@/lib/admin/format";
import { BarList, Feed, KpiStrip, PageHead, Panel, Pill } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { LiveAttention } from "@/components/analytics/LiveAttention";

interface Live {
  activeVisitors: number;
  pageviewsLast5m: number;
  pageviewsToday: number;
  visitorsToday: number;
  activePages: { path: string; visitors: number }[];
  recentClicks: { path: string; label: string | null; at: string }[];
}

interface Summary {
  days: { date: string; pageviews: number; visitors: number }[];
  topPaths: { path: string; pageviews: number }[];
  topReferrers: { host: string; count: number }[];
  inbound: {
    demoRequests: number;
    jobApplications: number;
    whitepaperDownloads: number;
    topWhitepapers: { slug: string; downloads: number }[];
  };
  formulieren: Record<string, { melding: number; velden: Record<string, number>; verstuurd: number }>;
}

const FORMULIER_NAAM: Record<string, string> = {
  demo: "Demo aanvragen (/demo)",
  "klus-plaatsen": "Klus samenstellen (/klus-plaatsen)",
  "register": "Aanmelden (/register)",
  "website-check": "Website-check: adres (/website-check)",
  "website-check-lead": "Website-check: contact (/website-check)",
  "uitzendbureau": "Uitzendbureau-aanvraag (/uitzendbureau)",
  "rekentool-uitkomst": "Rekentool: uitkomst mailen (/rekentools)",
  "btw-check": "Btw-nummer check (/rekentools/btw-nummer-check)",
};

const RANGES = [7, 30, 90] as const;

export function TrafficDashboard() {
  const [live, setLive] = useState<Live | null>(null);
  const [attention, setAttention] = useState<LiveSnapshot | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [l, a] = await Promise.all([
        fetch("/api/admin/analytics/live", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/admin/analytics/attention", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!alive) return;
      if (l) setLive(l);
      if (a) setAttention(a);
    };
    void load();
    const t = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    fetch(`/api/admin/analytics/summary?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSummary(d))
      .catch(() => undefined);
  }, [days]);

  const who = attention?.today.who ?? {};
  const totalWho = Object.values(who).reduce((a, b) => a + b, 0);
  const loggedIn = (who.freelancer ?? 0) + (who.bedrijf ?? 0);
  const totalViews = summary?.days.reduce((s, d) => s + d.pageviews, 0) ?? 0;

  return (
    <div className="space-y-4">
      <PageHead
        title="Verkeer"
        subtitle="Realtime bezoek, aandacht, kliks en historie, via de eigen analytics van ZekerFlex zonder cookies."
        meta={
          <>
            <Pill tone="ok">Live</Pill>
            <Pill dot={false}>Zonder cookies</Pill>
          </>
        }
      />

      <KpiStrip
        items={[
          { label: "Nu op de site", value: attention ? count(attention.active.length) : "—", hint: "laatste 90 seconden" },
          { label: "Bezoekers vandaag", value: live ? count(live.visitorsToday) : "—", hint: live ? `${count(live.pageviewsToday)} pagina's bekeken` : "laden" },
          { label: "Zonder account", value: attention ? `${percentOf(who.anoniem ?? 0, totalWho)}%` : "—", hint: `${count(who.anoniem ?? 0)} bezoeken vandaag` },
          { label: "Ingelogd vandaag", value: attention ? count(loggedIn) : "—", hint: `${count(who.freelancer ?? 0)} freelancer, ${count(who.bedrijf ?? 0)} bedrijf` },
          { label: "Laatste 5 minuten", value: live ? count(live.pageviewsLast5m) : "—", hint: live ? `${count(live.activeVisitors)} actieve bezoekers` : "laden" },
        ]}
      />

      <Panel
        title="Bezoek per dag"
        subtitle={summary ? `${count(totalViews)} pagina's bekeken in ${days} dagen` : undefined}
        actions={
          <nav aria-label="Periode" className="inline-flex rounded-lg p-0.5" style={{ background: "var(--a-elev)" }}>
            {RANGES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                aria-pressed={days === n}
                className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                style={days === n ? { background: "var(--a-panel)", color: "var(--a-text)", boxShadow: "var(--a-shadow-sm)" } : { color: "var(--a-mute)" }}
              >
                {n} d
              </button>
            ))}
          </nav>
        }
      >
        <Chart
          title="Bekeken pagina's en unieke bezoekers per dag"
          kind="line"
          unit="count"
          labels={(summary?.days ?? []).map((d) => d.date)}
          series={[
            { label: "Bekeken pagina's", values: (summary?.days ?? []).map((d) => d.pageviews), slot: 1 },
            { label: "Bezoekers", values: (summary?.days ?? []).map((d) => d.visitors), slot: 3 },
          ]}
          height={240}
          emptyText="Nog geen historie in deze periode."
        />
      </Panel>

      <LiveAttention d={attention} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Populairste pagina's" subtitle={`Laatste ${days} dagen`}>
          <BarList emptyText="Nog geen historie." rows={(summary?.topPaths ?? []).map((p) => ({ key: p.path, label: <span className="font-mono text-xs">{p.path}</span>, value: p.pageviews, display: count(p.pageviews) }))} />
        </Panel>
        <Panel title="Verwijzers" subtitle={`Laatste ${days} dagen`}>
          <BarList emptyText="Geen externe verwijzers." rows={(summary?.topReferrers ?? []).map((r) => ({ key: r.host, label: r.host, value: r.count, display: count(r.count) }))} />
        </Panel>
        <Panel title="Actieve pagina's" subtitle="Wie kijkt nu waarnaar">
          <BarList emptyText="Nog geen activiteit." rows={(live?.activePages ?? []).map((p) => ({ key: p.path, label: <span className="font-mono text-xs">{p.path}</span>, value: p.visitors, display: count(p.visitors) }))} />
        </Panel>
        <Panel title="Laatste kliks" subtitle="Uit de eigen tracker">
          <Feed emptyText="Nog geen kliks." items={(live?.recentClicks ?? []).map((c, i) => ({ key: `${c.at}-${i}`, text: c.label ?? "—", meta: c.path }))} />
        </Panel>
      </div>

      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Instroom uit de site, laatste {days} dagen</h2>
        <KpiStrip
          items={[
            { label: "Demo-aanvragen", value: count(summary?.inbound.demoRequests ?? 0), hint: "naar de sales-pijplijn", href: "/admin/sales" },
            { label: "Open sollicitaties", value: count(summary?.inbound.jobApplications ?? 0), hint: "naar sollicitaties", href: "/admin/sollicitaties" },
            { label: "Whitepaper-downloads", value: count(summary?.inbound.whitepaperDownloads ?? 0), hint: summary?.inbound.topWhitepapers[0] ? `meest: ${summary.inbound.topWhitepapers[0].slug}` : "nog geen downloads" },
          ]}
        />
        {/* sinds 14 nov staat de verstuurknop aan en zegt een melding wat ontbreekt; hier zie je of dat helpt (lib/analytics/formulier-meting.ts) */}
        <Panel title="Formulieren: melding gezien en verstuurd" subtitle={`"Vul nog in" gezien (één keer per veld per sessie) tegenover echt verstuurd, laatste ${days} dagen`}>
          {summary && Object.keys(summary.formulieren).length > 0 ? (
            <ul className="space-y-2 text-sm">
              {Object.entries(summary.formulieren).map(([naam, t]) => {
                const meest = Object.entries(t.velden).sort(([, a], [, b]) => b - a)[0];
                return (
                  <li key={naam} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span style={{ color: "var(--a-text)" }}>{FORMULIER_NAAM[naam] ?? naam}</span>
                    <span className="num" style={{ color: "var(--a-mute)" }}>
                      melding gezien {count(t.melding)} · verstuurd {count(t.verstuurd)}
                      {meest ? ` · meest gemist: ${meest[0]} (${count(meest[1])})` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen meldingen of verzendingen gemeten in deze periode.</p>
          )}
        </Panel>
      </section>
    </div>
  );
}
