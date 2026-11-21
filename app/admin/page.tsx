import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { ADMIN_HUBS } from "@/lib/admin/nav";
import { resolvePeriod } from "@/lib/admin/period";
import { homeInsights } from "@/lib/admin/insights/home";
import { count, dateNl, euro, timeAgoNl } from "@/lib/admin/format";
import { Feed, KpiStrip, PageHead, Panel, PeriodTabs, Pill, Spark, type KpiProps, type Tone } from "@/components/admin/kit";
import { HomeLive } from "@/components/admin/HomeLive";
import { WeekCijfersKaart } from "@/components/admin/WeekCijfersKaart";
import { haalWeekCijfers } from "@/lib/admin/weekcijfers";

export const dynamic = "force-dynamic";

// Het Controlecentrum (21 nov 2026, eigenaar: "haal al die extra dingen weg"): alleen wat ertoe doet
// voor het flexwerk-platform. Acht getallen, de week in vijf getallen, wat op een mens wacht, wat er
// net gebeurde en per onderdeel een tegel. Geen webshop, verkoop of proeven meer op dit scherm.

const SEVERITY: Record<string, { tone: Tone; label: string }> = {
  high: { tone: "crit", label: "Urgent" },
  medium: { tone: "warn", label: "Vandaag" },
  low: { tone: "neutral", label: "Later" },
};

/** Amber = wacht op jou, rood = probleem (één kleur, één betekenis; zie AGENTS.md → Kleuren). */
const toon = (n: number, tone: Tone): Pick<KpiProps, "tone"> => (n > 0 ? { tone } : {});

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
  const [d, week] = await Promise.all([homeInsights(period), haalWeekCijfers()]);
  const now = new Date();
  const firstName = principal.fullName.split(/\s+/)[0] ?? "";
  const onderdelen = ADMIN_HUBS.filter((hub) => !hub.verborgen && d.hubs[hub.id]);

  return (
    <div className="space-y-4">
      <PageHead
        title={`${greeting(now)}, ${firstName}`}
        subtitle={<span className="inline-block first-letter:uppercase">{dateNl(now, { weekday: "long", day: "numeric", month: "long" })}</span>}
        meta={<HomeLive />}
        actions={<PeriodTabs period={period} basePath="/admin" />}
      />

      <KpiStrip
        items={[
          { label: "Nieuwe aanmeldingen", value: count(d.signups.total), delta: d.signups.delta, spark: d.signups.series, hint: "zonder test- en eigen accounts", href: "/admin/gebruikers" },
          { label: "Nieuwe bedrijven", value: count(d.bedrijven.total), delta: d.bedrijven.delta, hint: period.versus, href: "/admin/bedrijven" },
          { label: "Open klussen", value: count(d.openKlussen.total), hint: d.openKlussen.binnenkort > 0 ? `${count(d.openKlussen.binnenkort)} beginnen binnen 2 dagen` : "zoeken nog mensen", href: "/admin/vooruitblik", ...toon(d.openKlussen.binnenkort, "warn") },
          { label: "Reacties", value: count(d.reacties.total), delta: d.reacties.delta, hint: "werkers die een klus aannamen", href: "/admin/vooruitblik" },
          { label: "Uren te keuren", value: count(d.urenTeKeuren), hint: "ingediend, wacht op het bedrijf", ...toon(d.urenTeKeuren, "warn") },
          { label: "Open facturen", value: euro(d.facturen.openCents), hint: d.facturen.teLaatCents > 0 ? `${count(d.facturen.openCount)} open · ${euro(d.facturen.teLaatCents)} te laat` : `${count(d.facturen.openCount)} open`, href: "/admin/facturen", ...toon(d.facturen.teLaatCents, "warn") },
          { label: "Foutmeldingen", value: d.fouten === null ? "—" : count(d.fouten), hint: "laatste 24 uur", href: "/admin/systeem", ...toon(d.fouten ?? 0, "crit") },
          { label: "Te doen", value: d.todos === null ? "—" : count(d.todos), hint: "taken voor jou", href: "/admin/te-doen", ...toon(d.todos ?? 0, "warn") },
        ]}
      />

      {/* elke week dezelfde vijf getallen, zonder test (lib/admin/weekcijfers.ts): beweegt er iets? */}
      <WeekCijfersKaart cijfers={week} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel flush title="Actie vereist" subtitle={d.triage.length === 0 ? "Alles is afgehandeld" : `${d.urgent} urgent, ${d.triage.length} in totaal`}>
          {d.triage.length === 0 ? (
            <p className="px-5 pb-6 text-sm" style={{ color: "var(--a-mute)" }}>Niets openstaand. Alles onder controle.</p>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto">
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

      <section aria-label="Onderdelen van de beheeromgeving">
        <h2 className="mb-2.5 mt-6 text-sm font-semibold" style={{ color: "var(--a-text)" }}>Onderdelen</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {onderdelen.map((hub) => {
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
    </div>
  );
}
