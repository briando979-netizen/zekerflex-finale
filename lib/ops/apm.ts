// ---------------------------------------------------------------------------
// Prestatiemeting (APM) in eigen beheer: hoe lang API-verzoeken en
// databasequery's duren, per route, met p95 en fouten, in het geheugen van de
// server (sinds de laatste start). Daarnaast gaan dezelfde metingen als
// histogram naar /api/metrics (Prometheus/Grafana) en komen trage verzoeken
// en query's in het foutenlogboek (Admin → Systeem), vanwaar ze ook naar een
// eigen GlitchTip gaan (lib/ops/glitchtip.ts).
//
// Op globalThis: de Next-server heeft meerdere kopieën van deze module (zie
// error-journal.ts), en ze moeten allemaal dezelfde tellers vullen.
// ---------------------------------------------------------------------------

export interface RouteStat {
  route: string;
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
  /** de laatste ~200 duren, voor p95 */
  recent: number[];
  lastAt: number;
}

export interface QuerySample {
  at: number;
  ms: number;
  /** alleen de vorm van de query (tabel, soort), nooit parameters */
  sql: string;
}

export interface ApmState {
  startedAt: number;
  routes: Map<string, RouteStat>;
  /** 60 minuut-emmers: index = minuut-van-het-uur */
  minutes: { minute: number; count: number; errors: number; totalMs: number }[];
  queries: { count: number; slow: number; totalMs: number; maxMs: number; recent: number[]; slowSamples: QuerySample[] };
}

const RECENT = 200;
const SLOW_SAMPLES = 25;
const MAX_ROUTES = 400;

const shared = globalThis as typeof globalThis & { __zfApm?: ApmState };

export function apmState(): ApmState {
  return (shared.__zfApm ??= {
    startedAt: Date.now(),
    routes: new Map(),
    minutes: Array.from({ length: 60 }, (_, minute) => ({ minute, count: 0, errors: 0, totalMs: 0 })),
    queries: { count: 0, slow: 0, totalMs: 0, maxMs: 0, recent: [], slowSamples: [] },
  });
}

/** /api/invoices/cmw1i8527007rs8lr9qltnx2f/pdf → /api/invoices/:id/pdf */
export function routeLabel(method: string, pathname: string): string {
  const pad = pathname
    .split("/")
    .map((s) => (/^(c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d{2,}|[A-Za-z0-9_-]{24,})$/.test(s) ? ":id" : s))
    .join("/");
  return `${method.toUpperCase()} ${pad || "/"}`;
}

export function percentiel(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function pushRecent(arr: number[], v: number): void {
  arr.push(v);
  if (arr.length > RECENT) arr.splice(0, arr.length - RECENT);
}

/** Eén afgehandeld verzoek. `now` alleen voor tests. */
export function meetVerzoek(route: string, ms: number, status: number, now = Date.now()): void {
  const st = apmState();
  let r = st.routes.get(route);
  if (!r) {
    if (st.routes.size >= MAX_ROUTES) return;
    r = { route, count: 0, errors: 0, totalMs: 0, maxMs: 0, recent: [], lastAt: 0 };
    st.routes.set(route, r);
  }
  const fout = status >= 500;
  r.count += 1;
  if (fout) r.errors += 1;
  r.totalMs += ms;
  r.maxMs = Math.max(r.maxMs, ms);
  r.lastAt = now;
  pushRecent(r.recent, ms);

  const minute = Math.floor(now / 60_000);
  const bucket = st.minutes[minute % 60]!;
  // een meting uit een oudere minuut dan de emmer al bevat telt niet meer mee voor "laatste uur"
  if (bucket.minute > minute) return;
  if (bucket.minute !== minute) {
    bucket.minute = minute;
    bucket.count = 0;
    bucket.errors = 0;
    bucket.totalMs = 0;
  }
  bucket.count += 1;
  if (fout) bucket.errors += 1;
  bucket.totalMs += ms;
}

/** Eén databasequery (Prisma query-event). `sql` is de kale SQL zonder parameters. */
export function meetQuery(ms: number, sql: string, slowMs: number, now = Date.now()): boolean {
  const q = apmState().queries;
  q.count += 1;
  q.totalMs += ms;
  q.maxMs = Math.max(q.maxMs, ms);
  pushRecent(q.recent, ms);
  if (ms < slowMs) return false;
  q.slow += 1;
  q.slowSamples.unshift({ at: now, ms, sql: queryVorm(sql) });
  if (q.slowSamples.length > SLOW_SAMPLES) q.slowSamples.length = SLOW_SAMPLES;
  return true;
}

/** De vorm van een query: soort + tabellen, zonder waarden. `SELECT … FROM "public"."Shift" WHERE …` → `SELECT Shift`. */
export function queryVorm(sql: string): string {
  const soort = (sql.trim().match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|WITH)\b/i)?.[1] ?? "query").toUpperCase();
  // Prisma schrijft tabellen als "public"."Naam"; kolommen volgen daar als ."kolom" op en tellen niet mee
  let tabellen = [...sql.matchAll(/"public"\."([A-Za-z_][A-Za-z0-9_]*)"/g)].map((m) => m[1]!);
  if (tabellen.length === 0) tabellen = [...sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)].map((m) => m[1]!);
  tabellen = tabellen.filter((t, i, a) => a.indexOf(t) === i);
  const joins = (sql.match(/\bJOIN\b/gi) ?? []).length;
  return `${soort} ${tabellen.slice(0, 4).join(", ")}${tabellen.length > 4 ? " …" : ""}${joins ? ` (${joins} join${joins === 1 ? "" : "s"})` : ""}`.trim();
}

export interface ApmSnapshot {
  sinds: string;
  laatsteUur: { verzoeken: number; fouten: number; gemMs: number };
  p95Ms: number;
  routes: { route: string; count: number; errors: number; gemMs: number; p95Ms: number; maxMs: number; laatst: string }[];
  queries: { count: number; slow: number; gemMs: number; p95Ms: number; maxMs: number; slowSamples: { at: string; ms: number; sql: string }[] };
}

export function apmSnapshot(now = Date.now()): ApmSnapshot {
  const st = apmState();
  const minute = Math.floor(now / 60_000);
  const uur = st.minutes.filter((b) => minute - b.minute < 60 && b.count > 0);
  const verzoeken = uur.reduce((s, b) => s + b.count, 0);
  const fouten = uur.reduce((s, b) => s + b.errors, 0);
  const totalMs = uur.reduce((s, b) => s + b.totalMs, 0);
  const alleRecent = [...st.routes.values()].flatMap((r) => r.recent);
  return {
    sinds: new Date(st.startedAt).toISOString(),
    laatsteUur: { verzoeken, fouten, gemMs: verzoeken ? Math.round(totalMs / verzoeken) : 0 },
    p95Ms: Math.round(percentiel(alleRecent, 95)),
    routes: [...st.routes.values()]
      .sort((a, b) => b.count - a.count)
      .map((r) => ({ route: r.route, count: r.count, errors: r.errors, gemMs: Math.round(r.totalMs / r.count), p95Ms: Math.round(percentiel(r.recent, 95)), maxMs: Math.round(r.maxMs), laatst: new Date(r.lastAt).toISOString() })),
    queries: {
      count: st.queries.count,
      slow: st.queries.slow,
      gemMs: st.queries.count ? Math.round(st.queries.totalMs / st.queries.count) : 0,
      p95Ms: Math.round(percentiel(st.queries.recent, 95)),
      maxMs: Math.round(st.queries.maxMs),
      slowSamples: st.queries.slowSamples.map((s) => ({ at: new Date(s.at).toISOString(), ms: Math.round(s.ms), sql: s.sql })),
    },
  };
}

/** Alleen voor tests. */
export function resetApm(): void {
  delete shared.__zfApm;
}
