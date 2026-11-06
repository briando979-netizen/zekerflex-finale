import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { apmSnapshot } from "@/lib/ops/apm";
import { glitchtipStatus } from "@/lib/ops/glitchtip";
import { listErrorGroups } from "@/lib/ops/error-journal";
import { plannerDienstStatus } from "@/lib/planner/service";
import { count, dateTimeNl } from "@/lib/admin/format";
import { InfoList, KpiStrip, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { DataTable } from "@/components/admin/kit-client";

export const dynamic = "force-dynamic";

const ms = (n: number) => `${count(n)} ms`;

// Prestaties en foutopsporing in eigen beheer: API-verzoeken en databasequery's
// per route (lib/ops/apm.ts), de koppeling met een eigen GlitchTip
// (lib/ops/glitchtip.ts) en Prometheus/Grafana (infra/docker).
export default async function PrestatiesPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Prestaties zijn alleen voor platformbeheerders." />;
  }

  const now = new Date();
  const [snap, glitch, planner, groups] = await Promise.all([apmSnapshot(), glitchtipStatus(), plannerDienstStatus(), listErrorGroups(500).catch(() => [])]);
  const traag24u = groups.filter((g) => /^(traag verzoek|trage databasequery)$/.test(g.message) && now.getTime() - Date.parse(g.lastAt) < 86_400_000);
  const foutPct = snap.laatsteUur.verzoeken ? Math.round((snap.laatsteUur.fouten / snap.laatsteUur.verzoeken) * 1000) / 10 : 0;
  const toon = (p95: number): Tone => (p95 >= env.APM_SLOW_REQUEST_MS ? "crit" : p95 >= env.APM_SLOW_REQUEST_MS / 2 ? "warn" : "ok");

  return (
    <>
      <PageHead
        title="Prestaties"
        subtitle={`Verzoeken en databasequery's sinds de start van de server (${dateTimeNl(snap.sinds, now)}). Elke uitrol begint opnieuw; de geschiedenis staat in Grafana en GlitchTip.`}
        actions={
          <Link href="/admin/systeem#fouten" className="a-btn text-xs">
            Foutmeldingen
          </Link>
        }
      />

      <KpiStrip
        items={[
          { label: "Verzoeken (laatste uur)", value: count(snap.laatsteUur.verzoeken), hint: `gemiddeld ${ms(snap.laatsteUur.gemMs)}` },
          { label: "p95 API", value: ms(snap.p95Ms), hint: `traag vanaf ${ms(env.APM_SLOW_REQUEST_MS)}`, tone: toon(snap.p95Ms) },
          { label: "Fouten (5xx)", value: `${foutPct}%`, hint: `${count(snap.laatsteUur.fouten)} in het laatste uur`, tone: foutPct >= 5 ? "crit" : foutPct >= 1 ? "warn" : "ok" },
          { label: "Database p95", value: ms(snap.queries.p95Ms), hint: `${count(snap.queries.count)} query's, ${count(snap.queries.slow)} traag (≥ ${ms(env.APM_SLOW_QUERY_MS)})`, tone: snap.queries.slow > 0 ? "warn" : "ok" },
        ]}
      />

      {traag24u.length > 0 && (
        <Notice tone="warn">
          {traag24u.length === 1 ? "Eén soort traag verzoek of trage query" : `${traag24u.length} soorten trage verzoeken of query's`} in de laatste 24 uur. Bekijk ze bij <Link href="/admin/systeem#fouten">Foutmeldingen</Link> (zoek op “traag”).
        </Notice>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Panel title="Per route" subtitle="Alleen API-routes met inlog (withAuth); openbare pagina's staan in Grafana">
            <DataTable
              columns={[
                { key: "route", label: "Route" },
                { key: "count", label: "Aantal", align: "right" },
                { key: "errors", label: "Fouten", align: "right", hideOnMobile: true },
                { key: "gem", label: "Gem.", align: "right", hideOnMobile: true },
                { key: "p95", label: "p95", align: "right" },
                { key: "max", label: "Max", align: "right", hideOnMobile: true },
              ]}
              rows={snap.routes.map((r) => ({
                id: r.route,
                cells: {
                  route: <code className="text-xs">{r.route}</code>,
                  count: count(r.count),
                  errors: r.errors ? <Pill tone="crit">{count(r.errors)}</Pill> : "0",
                  gem: ms(r.gemMs),
                  p95: <Pill tone={toon(r.p95Ms)}>{ms(r.p95Ms)}</Pill>,
                  max: ms(r.maxMs),
                },
                sort: { route: r.route, count: r.count, errors: r.errors, gem: r.gemMs, p95: r.p95Ms, max: r.maxMs },
                search: r.route,
                csv: { route: r.route, aantal: r.count, fouten: r.errors, gem_ms: r.gemMs, p95_ms: r.p95Ms, max_ms: r.maxMs, laatst: r.laatst },
              }))}
              defaultSort={{ key: "count", dir: "desc" }}
              searchPlaceholder="Zoek een route"
              emptyText="Nog geen verzoeken gemeten sinds de start."
              csvName="prestaties-routes"
            />
          </Panel>

          <Panel title="Trage databasequery's" subtitle={`De laatste ${snap.queries.slowSamples.length} boven ${ms(env.APM_SLOW_QUERY_MS)}; alleen de vorm van de query, nooit waarden`}>
            <DataTable
              columns={[
                { key: "at", label: "Wanneer" },
                { key: "ms", label: "Duur", align: "right" },
                { key: "sql", label: "Query" },
              ]}
              rows={snap.queries.slowSamples.map((s, i) => ({
                id: `${s.at}-${i}`,
                cells: { at: dateTimeNl(s.at, now), ms: ms(s.ms), sql: <code className="text-xs">{s.sql}</code> },
                sort: { at: s.at, ms: s.ms },
              }))}
              emptyText="Geen trage query's sinds de start."
            />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Koppelingen">
            <InfoList
              rows={[
                {
                  label: "GlitchTip (fouten)",
                  value: glitch.ingesteld ? (
                    <span>
                      <Pill tone={glitch.laatstFout && (!glitch.laatstOk || glitch.laatstFout > glitch.laatstOk) ? "crit" : "ok"}>{glitch.laatstOk ? `laatst ${dateTimeNl(glitch.laatstOk, now)}` : "ingesteld"}</Pill>
                      {glitch.fout ? <span className="mt-1 block text-xs" style={{ color: "var(--a-dim)" }}>{glitch.fout}</span> : null}
                    </span>
                  ) : (
                    <Pill tone="neutral">niet ingesteld</Pill>
                  ),
                },
                { label: "Prometheus", value: "/api/metrics (token), histogrammen zf_http_request_duration_seconds en zf_db_query_duration_seconds" },
                { label: "Grafana + Loki", value: "infra/docker/docker-compose.observability.yml (niet publiek; via SSH-tunnel)" },
                { label: "Roosterplanner (OR-Tools)", value: planner.ingesteld ? <Pill tone={planner.bereikbaar ? "ok" : "crit"}>{planner.bereikbaar ? "bereikbaar" : "niet bereikbaar"}</Pill> : <Pill tone="neutral">ingebouwde oplosser</Pill> },
              ]}
            />
          </Panel>
          <Panel title="Hoe het werkt">
            <InfoList
              rows={[
                { label: "Verzoeken", value: "Elke API-route met inlog wordt getimed; id's in het pad worden :id, zodat één route één rij is." },
                { label: "Traag", value: `Een verzoek boven ${ms(env.APM_SLOW_REQUEST_MS)} of een query boven ${ms(env.APM_SLOW_QUERY_MS)} komt als waarschuwing in het foutenlogboek en dus ook in GlitchTip.` },
                { label: "Privacy", value: "Alleen duur, route, status en de vorm van een query; geen parameters, geen persoonsgegevens." },
                { label: "Aanzetten", value: "Zie Admin → Te doen → “Fouten en prestaties bewaken”." },
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
