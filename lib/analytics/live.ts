import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Live, anonymous visitor measurement — first-party, no cookies, no IP, no
// personal data, nothing shared with third parties. A visit is a random id
// that lives in the visitor's sessionStorage (gone when the tab closes).
// What it measures: which page, how long it is actually looked at (only while
// the tab is visible), when someone switches away or leaves, device class,
// where they came from, and whether they're logged in (and as what) or an
// anonymous visitor. Gender or other personal traits are deliberately NOT
// guessed: that's unreliable and not allowed without consent (AVG).
//
// Redis keys (all expire):
//   an:live                     hash visitId → LiveVisit JSON   (pruned >90s)
//   an:d:<day>:views|ms|exits|away   hash path → number
//   an:d:<day>:who              hash role → visits
//   an:d:<day>:src              hash source → visits
//   an:d:<day>:uv               HyperLogLog of visit ids
//   an:d:<day>:nudge            hash "<id>:shown|click" → number
// ---------------------------------------------------------------------------

export type Role = "anoniem" | "freelancer" | "bedrijf";
export type VisitEvent = "view" | "beat" | "hide" | "show" | "leave" | "nudge-shown" | "nudge-click";

export interface LiveVisit {
  id: string;
  path: string;
  since: number; // page start (ms epoch)
  lastSeen: number;
  visibleMs: number; // on this page
  hidden: boolean;
  device: "mobiel" | "tablet" | "desktop";
  role: Role;
  source: string;
  pages: number;
}

const DAY_TTL = 40 * 86_400;
const LIVE_WINDOW_MS = 90_000;
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const k = (d: string, part: string) => `an:d:${d}:${part}`;

export function normalisePath(p: string): string {
  const path = (p || "/").split("?")[0]!.split("#")[0]!.slice(0, 120) || "/";
  // group detail pages so the list stays readable
  return path.replace(/\/klussen\/[\w-]{10,}$/, "/klussen/[klus]").replace(/\/shop\/[\w-]+$/, (m) => (m === "/shop/account" || m === "/shop/bestelling" ? m : "/shop/[product]"));
}

export function sourceOf(ref: string | undefined, host: string): string {
  if (!ref) return "direct";
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    if (!h || h === host.replace(/^www\./, "")) return "intern";
    if (/google\./.test(h)) return "google";
    if (/bing\.|duckduckgo|ecosia|yahoo/.test(h)) return "zoekmachine";
    if (/chatgpt|openai|perplexity|claude\.ai|gemini|copilot/.test(h)) return "ai-assistent";
    if (/facebook|instagram|linkedin|tiktok|t\.co|twitter|x\.com|whatsapp/.test(h)) return "social";
    return h.slice(0, 40);
  } catch {
    return "onbekend";
  }
}

export async function recordVisitEvent(input: {
  id: string;
  event: VisitEvent;
  path: string;
  ms?: number;
  device: LiveVisit["device"];
  role: Role;
  source: string;
  nudge?: string;
}): Promise<void> {
  const now = Date.now();
  const d = day();
  const path = normalisePath(input.path);
  const ms = Math.max(0, Math.min(Math.round(input.ms ?? 0), 120_000));
  const raw = await redis.hget("an:live", input.id);
  const cur: LiveVisit | null = raw ? (JSON.parse(raw) as LiveVisit) : null;
  const p = redis.multi();

  if (input.event === "nudge-shown" || input.event === "nudge-click") {
    if (input.nudge) p.hincrby(k(d, "nudge"), `${input.nudge.slice(0, 30)}:${input.event === "nudge-shown" ? "shown" : "click"}`, 1).expire(k(d, "nudge"), DAY_TTL);
    await p.exec();
    return;
  }

  let next: LiveVisit;
  if (input.event === "view" || !cur) {
    next = { id: input.id, path, since: now, lastSeen: now, visibleMs: 0, hidden: false, device: input.device, role: input.role, source: cur?.source ?? input.source, pages: (cur?.pages ?? 0) + 1 };
    p.hincrby(k(d, "views"), path, 1).expire(k(d, "views"), DAY_TTL);
    if (!cur) {
      p.pfadd(k(d, "uv"), input.id).expire(k(d, "uv"), DAY_TTL);
      p.hincrby(k(d, "who"), input.role, 1).expire(k(d, "who"), DAY_TTL);
      p.hincrby(k(d, "src"), input.source, 1).expire(k(d, "src"), DAY_TTL);
    }
  } else {
    next = { ...cur, lastSeen: now, visibleMs: cur.visibleMs + ms, hidden: input.event === "hide" ? true : input.event === "show" ? false : cur.hidden };
  }
  if (ms > 0) p.hincrby(k(d, "ms"), path, ms).expire(k(d, "ms"), DAY_TTL);
  if (input.event === "hide") p.hincrby(k(d, "away"), path, 1).expire(k(d, "away"), DAY_TTL);
  if (input.event === "leave") {
    p.hincrby(k(d, "exits"), path, 1).expire(k(d, "exits"), DAY_TTL);
    p.hdel("an:live", input.id);
  } else {
    p.hset("an:live", input.id, JSON.stringify(next));
  }
  p.expire("an:live", 3600);
  await p.exec();
}

export interface LiveSnapshot {
  now: number;
  active: (LiveVisit & { onPageSec: number })[];
  today: {
    visitors: number;
    who: Record<string, number>;
    sources: { source: string; visits: number }[];
    pages: { path: string; views: number; avgSec: number; exitRate: number; away: number }[];
    nudges: { id: string; shown: number; clicks: number }[];
  };
}

const num = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([a, b]) => [a, Number(b) || 0]));

export async function liveSnapshot(): Promise<LiveSnapshot> {
  const now = Date.now();
  const d = day();
  const all = await redis.hgetall("an:live");
  const stale: string[] = [];
  const active: LiveSnapshot["active"] = [];
  for (const [id, json] of Object.entries(all)) {
    const v = JSON.parse(json) as LiveVisit;
    if (now - v.lastSeen > LIVE_WINDOW_MS) stale.push(id);
    else active.push({ ...v, onPageSec: Math.round((now - v.since) / 1000) });
  }
  if (stale.length) await redis.hdel("an:live", ...stale);
  active.sort((a, b) => b.lastSeen - a.lastSeen);

  const [views, ms, exits, away, who, src, uv, nudge] = await Promise.all([
    redis.hgetall(k(d, "views")),
    redis.hgetall(k(d, "ms")),
    redis.hgetall(k(d, "exits")),
    redis.hgetall(k(d, "away")),
    redis.hgetall(k(d, "who")),
    redis.hgetall(k(d, "src")),
    redis.pfcount(k(d, "uv")),
    redis.hgetall(k(d, "nudge")),
  ]);
  const V = num(views), M = num(ms), E = num(exits), A = num(away), N = num(nudge);
  const pages = Object.keys(V)
    .map((path) => ({ path, views: V[path]!, avgSec: Math.round((M[path] ?? 0) / 1000 / Math.max(1, V[path]!)), exitRate: Math.round(((E[path] ?? 0) / Math.max(1, V[path]!)) * 100), away: A[path] ?? 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 40);
  const nudgeIds = [...new Set(Object.keys(N).map((x) => x.split(":")[0]!))];
  return {
    now,
    active,
    today: {
      visitors: uv,
      who: num(who),
      sources: Object.entries(num(src)).map(([source, visits]) => ({ source, visits })).sort((a, b) => b.visits - a.visits).slice(0, 12),
      pages,
      nudges: nudgeIds.map((id) => ({ id, shown: N[`${id}:shown`] ?? 0, clicks: N[`${id}:click`] ?? 0 })),
    },
  };
}
