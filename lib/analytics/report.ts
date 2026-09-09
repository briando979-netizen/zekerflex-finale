import { prisma } from "@/lib/prisma";

// Read-side aggregations for the live traffic dashboard and Jarvis briefings.

export interface LiveTraffic {
  activeVisitors: number; // distinct sessions in the last 5 min
  pageviewsLast5m: number;
  pageviewsToday: number;
  visitorsToday: number;
  activePages: { path: string; visitors: number }[];
  recentClicks: { path: string; label: string | null; at: string }[];
}

const FIVE_MIN = 5 * 60 * 1000;

function startOfDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function liveTraffic(): Promise<LiveTraffic> {
  const since5m = new Date(Date.now() - FIVE_MIN);
  const dayStart = startOfDay();

  const [
    activeSessions,
    pageviewsLast5m,
    pageviewsToday,
    visitorSessionsToday,
    activePageRows,
    recentClicks,
  ] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: since5m } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    }),
    prisma.analyticsEvent.count({
      where: { type: "PAGEVIEW", createdAt: { gte: since5m } },
    }),
    prisma.analyticsEvent.count({
      where: { type: "PAGEVIEW", createdAt: { gte: dayStart } },
    }),
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: dayStart } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["path"],
      where: { type: "PAGEVIEW", createdAt: { gte: since5m } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 8,
    }),
    prisma.analyticsEvent.findMany({
      where: { type: "CLICK" },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { path: true, label: true, createdAt: true },
    }),
  ]);

  return {
    activeVisitors: activeSessions.length,
    pageviewsLast5m,
    pageviewsToday,
    visitorsToday: visitorSessionsToday.length,
    activePages: activePageRows.map((r) => ({ path: r.path, visitors: r._count._all })),
    recentClicks: recentClicks.map((r) => ({
      path: r.path,
      label: r.label,
      at: r.createdAt.toISOString(),
    })),
  };
}

export interface TrafficSummary {
  days: { date: string; pageviews: number; visitors: number }[];
  topPaths: { path: string; pageviews: number }[];
  topReferrers: { host: string; count: number }[];
  /** Marketing conversions in the window — all from server-side events. */
  inbound: {
    demoRequests: number;
    jobApplications: number;
    whitepaperDownloads: number;
    topWhitepapers: { slug: string; downloads: number }[];
  };
}

const INBOUND_LABELS = ["demo-request", "open-application", "whitepaper-download"];

export async function trafficSummary(days = 7): Promise<TrafficSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [events, conversions] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { type: "PAGEVIEW", createdAt: { gte: since } },
      select: { path: true, sessionId: true, createdAt: true, referrerHost: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { type: "CUSTOM", createdAt: { gte: since }, label: { in: INBOUND_LABELS } },
      select: { label: true, meta: true },
    }),
  ]);

  let demoRequests = 0;
  let jobApplications = 0;
  const wp = new Map<string, number>();
  for (const e of conversions) {
    if (e.label === "demo-request") demoRequests += 1;
    else if (e.label === "open-application") jobApplications += 1;
    else if (e.label === "whitepaper-download") {
      const slug = (e.meta as { slug?: string } | null)?.slug ?? "onbekend";
      wp.set(slug, (wp.get(slug) ?? 0) + 1);
    }
  }
  const whitepaperDownloads = [...wp.values()].reduce((a, b) => a + b, 0);
  const topWhitepapers = [...wp.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([slug, downloads]) => ({ slug, downloads }));

  const byDay = new Map<string, { pv: number; sessions: Set<string> }>();
  const byPath = new Map<string, number>();
  const byRef = new Map<string, number>();
  for (const e of events) {
    const day = e.createdAt.toISOString().slice(0, 10);
    const d = byDay.get(day) ?? { pv: 0, sessions: new Set() };
    d.pv += 1;
    d.sessions.add(e.sessionId);
    byDay.set(day, d);
    byPath.set(e.path, (byPath.get(e.path) ?? 0) + 1);
    if (e.referrerHost) byRef.set(e.referrerHost, (byRef.get(e.referrerHost) ?? 0) + 1);
  }

  return {
    days: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, pageviews: v.pv, visitors: v.sessions.size })),
    topPaths: [...byPath.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([path, pageviews]) => ({ path, pageviews })),
    topReferrers: [...byRef.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([host, count]) => ({ host, count })),
    inbound: { demoRequests, jobApplications, whitepaperDownloads, topWhitepapers },
  };
}
