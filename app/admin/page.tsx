import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { ADMIN_HUBS } from "@/lib/admin/nav";
import { resolvePeriod } from "@/lib/admin/period";
import { homeInsights } from "@/lib/admin/insights/home";
import { count, dateNl, euro, timeAgoNl } from "@/lib/admin/format";
import { Feed, Funnel, KpiStrip, PageHead, Panel, PeriodTabs, Pill, Spark, type Tone } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { HomeLive } from "@/components/admin/HomeLive";
import { VerkoopKaart } from "@/components/admin/VerkoopKaart";
import { verkoopWacht } from "@/lib/admin/verkoop-wacht";

export const dynamic = "force-dynamic";

const SEVERITY: Record<string, { tone: Tone; label: string }> = {
  high: { tone: "crit", label: "Urgent" },
  medium: { tone: "warn", label: "Vandaag" },
  low: { tone: "neutral", label: "Later" },
};

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 6) return "Goedenacht";
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

export default async function AdminHomePage(props: { searchParams: Promise<{ periode?: string }> }) {
  const principal = await getPrincipal();
  // De layout laat ook bedrijfsbeheerders en dispuutmanagers toe: die horen bij hun disputen.
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) redirect("/admin/disputes");
  const { periode } = await props.searchParams;
  const period = resolvePeriod(periode);
  const [d, verkoop] = await Promise.all([homeInsights(period), verkoopWacht()]);
  const now = new Date();
  const firstName = principal.fullName.split(/\s+/)[0] ?? "";
  const funnels = d.funnels.filter((f) => f.steps.some((s) => s.count > 0));

  return (
    <div className="space-y-4">
      <PageHead
        title={`${greeting(now)}, ${firstName}`}
        subtitle={<span className="inline-block first-letter:uppercase">{dateNl(now, { weekday: "long", day: "numeric", month: "long" })}</span>}
        meta={<HomeLive />}
        actions={<PeriodTabs period={period} basePath="/admin" />}
      />

      {/* wat de eigenaar kan verkopen en wat op een mens wacht (lib/admin/verkoop-wacht.ts) */}
      <VerkoopKaart stand={verkoop} />

      <KpiStrip
        items={[
          { label: "Eigen omzet", value: euro(d.revenue.total), delta: d.revenue.delta, spark: d.revenue.series, hint: period.versus, href: "/admin/financien" },
          { label: "Door het platform", value: euro(d.gross.total), delta: d.gross.delta, hint: "gefactureerd + webshop", href: "/admin/facturen" },
          { label: "Gewerkte uren", value: count(Math.round(d.hours.total)), delta: d.hours.delta, spark: d.hours.series, href: "/admin/verloning" },
          { label: "Bezetting", value: `${d.fill.pct}%`, delta: d.fill.delta, hint: `${d.fill.filled} van ${d.fill.total} klussen`, href: "/admin/vooruitblik" },
          { label: "Nieuwe gebruikers", value: count(d.signups.total), delta: d.signups.delta, spark: d.signups.series, href: "/admin/gebruikers" },
          { label: "Bezoekers", value: count(d.visitors.total), delta: d.visitors.delta, spark: d.visitors.series, href: "/admin/analytics" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Panel title="Eigen omzet" subtitle={`Marge op facturen en webshop, laatste ${period.label}`}>
          <Chart title={`Eigen omzet per ${period.bucket === "month" ? "maand" : "dag"}`} kind="bars" unit="money" labels={d.labels} series={[{ label: "Eigen omzet", values: d.revenue.series }]} height={250} emptyText="Nog geen omzet in deze periode." />
        </Panel>
        <Panel flush title="Actie vereist" subtitle={d.triage.length === 0 ? "Alles is afgehandeld" : `${d.urgent} urgent, ${d.triage.length} in totaal`}>
          {d.triage.length === 0 ? (
            <p className="px-5 pb-6 text-sm" style={{ color: "var(--a-mute)" }}>Niets openstaand. Alles onder controle.</p>
          ) : (
            <ul className="max-h-[19.5rem] overflow-y-auto">
              {d.triage.map((item) => (
                <li key={item.id} style={{ borderTop: "1px solid var(--a-border)" }}>
                  <Link href={item.href} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--a-panel-2)] sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{item.title}</span>
                      <span className="block truncate text-xs" style={{ color: "var(--a-mute)" }}>{item.detail}</span>
                    </span>
                    <Pill tone={SEVERITY[item.severity]?.tone ?? "neutral"}>{item.kind}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Gewerkte uren" subtitle="Goedgekeurde uren">
          <Chart title="Gewerkte uren" kind="bars" unit="hours" labels={d.labels} series={[{ label: "Uren", values: d.hours.series }]} height={170} emptyText="Nog geen goedgekeurde uren." />
        </Panel>
        <Panel title="Aanmeldingen" subtitle="Nieuwe accounts">
          <Chart title="Nieuwe accounts" kind="bars" unit="count" labels={d.labels} series={[{ label: "Aanmeldingen", values: d.signups.series }]} height={170} emptyText="Geen aanmeldingen in deze periode." />
        </Panel>
        <Panel title="Bezoekers" subtitle="Unieke bezoekers op de site">
          <Chart title="Unieke bezoekers" kind="line" unit="count" labels={d.labels} series={[{ label: "Bezoekers", values: d.visitors.series }]} height={170} emptyText="Nog geen bezoekers geteld." />
        </Panel>
      </div>

      <section aria-label="Onderdelen van de beheeromgeving">
        <h2 className="mb-2.5 mt-6 text-sm font-semibold" style={{ color: "var(--a-text)" }}>Alle onderdelen</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ADMIN_HUBS.filter((hub) => d.hubs[hub.id]).map((hub) => {
            const data = d.hubs[hub.id]!;
            return (
              <Link key={hub.id} href={hub.pages[0]!.href} className="a-panel group block p-4 transition-colors hover:border-[var(--a-border-strong)] sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                      {hub.label}
                      <span className="transition-transform group-hover:translate-x-0.5" style={{ color: "var(--a-mute)" }} aria-hidden>→</span>
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>{hub.blurb}</p>
                  </div>
                  {data.spark ? <Spark data={data.spark} width={52} height={22} /> : null}
                </div>
                <dl className="mt-3.5 grid grid-cols-3 gap-2">
                  {data.metrics.map((m) => (
                    <div key={m.label} className="flex min-w-0 flex-col justify-end">
                      <dt className="text-[0.6875rem] leading-tight" style={{ color: "var(--a-mute)" }}>{m.label}</dt>
                      <dd className="mt-0.5 truncate text-[0.9375rem] font-semibold tracking-tight" style={{ color: m.tone && m.tone !== "neutral" ? `var(--a-${m.tone})` : "var(--a-text)" }}>{m.value}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            );
          })}
        </div>
      </section>

      <div className={`grid gap-4 pt-2 ${funnels.length >= 2 ? "lg:grid-cols-3" : funnels.length === 1 ? "lg:grid-cols-2" : ""}`}>
        {funnels.map((f) => (
          <Panel key={f.key} title={f.label} subtitle={period.days > 90 ? "Laatste 12 maanden" : "Laatste 3 maanden"}>
            <Funnel stages={f.steps.map((s) => ({ label: s.label, value: s.count }))} />
          </Panel>
        ))}
        <Panel title="Laatste activiteit" subtitle="Wat er net gebeurde">
          <Feed
            items={d.activity.map((a) => ({
              key: a.key,
              text: a.text,
              meta: timeAgoNl(a.at),
              tone: a.severity === "critical" ? "crit" : a.severity === "warning" ? "warn" : "ok",
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
