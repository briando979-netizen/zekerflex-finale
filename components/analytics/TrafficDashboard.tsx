"use client";

import { useEffect, useState } from "react";
import { APageHeader, APanel, AStat } from "@/components/admin/ui";

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
}

function Row({ left, right, mute }: { left: string; right: string | number; mute?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="truncate" style={{ color: mute ? "var(--a-mute)" : "var(--a-dim)" }}>
        {left}
      </span>
      <span className="num shrink-0 font-mono text-xs" style={{ color: "var(--a-mute)" }}>
        {right}
      </span>
    </li>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p className="py-6 text-center text-[13px]" style={{ color: "var(--a-mute)" }}>
      {children}
    </p>
  );
}

export function TrafficDashboard() {
  const [live, setLive] = useState<Live | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/admin/analytics/live", { cache: "no-store" });
        if (r.ok) setLive(await r.json());
      } catch {
        /* ignore */
      }
    };
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch("/api/admin/analytics/summary?days=7", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSummary(d))
      .catch(() => undefined);
  }, []);

  const maxDay = Math.max(1, ...(summary?.days.map((d) => d.pageviews) ?? [1]));

  return (
    <div className="mx-auto max-w-6xl">
      <APageHeader
        title="Verkeer & Analytics"
        badge="100% lokaal · geen cookies"
        subtitle="Realtime bezoek, kliks en historie — volledig zelf-gehost, zonder externe trackers."
        action={
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--a-mute)" }}>
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "#4ade80" }} />
            live
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AStat label="Actieve bezoekers" value={live?.activeVisitors ?? "–"} sub="laatste 5 min" watermark={<Glyph />} />
        <AStat label="Pageviews" value={live?.pageviewsLast5m ?? "–"} sub="laatste 5 min" watermark={<Glyph />} />
        <AStat label="Bezoekers vandaag" value={live?.visitorsToday ?? "–"} watermark={<Glyph />} />
        <AStat label="Pageviews vandaag" value={live?.pageviewsToday ?? "–"} watermark={<Glyph />} />
      </div>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <APanel title="Actieve pagina's" subtitle="wie kijkt nu waarnaar">
          {live && live.activePages.length > 0 ? (
            <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
              {live.activePages.map((p) => (
                <Row key={p.path} left={p.path} right={p.visitors} />
              ))}
            </ul>
          ) : (
            <Empty>Nog geen activiteit.</Empty>
          )}
        </APanel>

        <APanel title="Laatste kliks" subtitle="events uit de sovereign tracker">
          {live && live.recentClicks.length > 0 ? (
            <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
              {live.recentClicks.map((clk, i) => (
                <Row key={i} left={clk.label ?? "—"} right={clk.path} mute />
              ))}
            </ul>
          ) : (
            <Empty>Nog geen kliks.</Empty>
          )}
        </APanel>
      </section>

      <section className="mt-4">
        <APanel title="Laatste 7 dagen" subtitle="pageviews per dag">
          {summary?.days.length ? (
            <div className="flex items-end gap-2" style={{ height: 140 }}>
              {summary.days.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-md"
                      style={{
                        height: `${Math.max(4, (d.pageviews / maxDay) * 100)}%`,
                        background: "linear-gradient(to top, var(--a-accent), color-mix(in srgb, var(--a-accent) 55%, transparent))",
                      }}
                      title={`${d.pageviews} pageviews · ${d.visitors} bezoekers`}
                    />
                  </div>
                  <span className="num font-mono text-[10px]" style={{ color: "var(--a-mute)" }}>
                    {d.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Nog geen historie.</Empty>
          )}
        </APanel>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <APanel title="Populairste pagina's" subtitle="laatste 7 dagen">
          {summary?.topPaths.length ? (
            <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
              {summary.topPaths.map((p) => (
                <Row key={p.path} left={p.path} right={p.pageviews} />
              ))}
            </ul>
          ) : (
            <Empty>Nog geen historie.</Empty>
          )}
        </APanel>
        <APanel title="Verwijzers" subtitle="laatste 7 dagen">
          {summary && summary.topReferrers.length > 0 ? (
            <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
              {summary.topReferrers.map((r) => (
                <Row key={r.host} left={r.host} right={r.count} />
              ))}
            </ul>
          ) : (
            <Empty>Geen externe verwijzers.</Empty>
          )}
        </APanel>
      </section>
    </div>
  );
}

function Glyph() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3v18h18" strokeLinecap="round" />
      <path d="M7 14l3-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
