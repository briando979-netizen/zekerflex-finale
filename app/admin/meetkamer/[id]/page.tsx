import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { resolvePeriod } from "@/lib/admin/period";
import { gebruikerTijdlijn } from "@/lib/analytics/meetkamer";
import { UUR_LABELS, tijdlijnPerDag, type TijdlijnSoort } from "@/lib/analytics/meetkamer-kern";
import { count, dateNl, dateTimeNl, timeAgoNl } from "@/lib/admin/format";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { BarList, Empty, KpiStrip, PageHead, Panel, PeriodTabs, Pill, type Tone } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";

export const dynamic = "force-dynamic";

// De tijdlijn van één account (Admin → Meetkamer → naam): elke inlog, elke bekeken pagina, elke klik en elke vastgelegde
// actie, per dag, met de kloktijd in Nederlandse tijd. Alleen voor platformbeheerders.

const SOORT: Record<TijdlijnSoort, { label: string; tone: Tone }> = {
  login: { label: "Inlog", tone: "ok" },
  "login-mislukt": { label: "Mislukt", tone: "crit" },
  pagina: { label: "Pagina", tone: "plan" },
  klik: { label: "Klik", tone: "neutral" },
  interactie: { label: "Interactie", tone: "trust" },
  actie: { label: "Actie", tone: "money" },
};
const ROL: Record<string, string> = { FREELANCER: "Flexwerker", LOCAL_MANAGER: "Vestigingsmanager", HQ_ADMIN: "Bedrijfsbeheerder", DISPUTE_MANAGER: "Dispuutmanager", PLATFORM_ADMIN: "Platformbeheerder", SALES: "Sales" };

export default async function MeetkamerGebruikerPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ periode?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De meetkamer is alleen voor platformbeheerders." />;
  }
  const [{ id }, { periode }] = await Promise.all([props.params, props.searchParams]);
  const period = resolvePeriod(periode, 30);
  const d = await gebruikerTijdlijn(id, period);
  if (!d) {
    return (
      <div>
        <PageHead title="Account niet gevonden" subtitle={id} />
        <Link href="/admin/meetkamer" className="text-sm font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>← Terug naar de meetkamer</Link>
      </div>
    );
  }
  const dagen = tijdlijnPerDag(d.tijdlijn);
  const rollen = d.user.memberships.map((m) => `${ROL[m.role] ?? m.role}${m.tenant ? ` · ${m.tenant.name}` : ""}`).join(", ") || "Geen rol";

  return (
    <div className="space-y-4">
      <Link href="/admin/meetkamer" className="inline-block text-xs font-medium hover:underline" style={{ color: "var(--a-mute)" }}>← Meetkamer</Link>
      <PageHead
        title={d.user.fullName}
        subtitle={<>{d.user.email} · {rollen} · lid sinds {dateNl(d.user.createdAt)} · <Link href={`/admin/gebruikers/${d.user.id}`} className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>accountpagina →</Link></>}
        actions={<PeriodTabs period={period} basePath={`/admin/meetkamer/${d.user.id}`} />}
        meta={d.user.disabledAt ? <Pill tone="crit">Geblokkeerd</Pill> : null}
      />

      <KpiStrip
        items={[
          { label: "Inlogs", value: count(d.stand?.logins ?? 0), hint: d.stand?.mislukt ? `${count(d.stand.mislukt)} mislukt` : `in ${period.label}` },
          { label: "Laatste inlog", value: d.stand?.laatsteLogin ? timeAgoNl(d.stand.laatsteLogin) : d.user.lastLoginAt ? timeAgoNl(d.user.lastLoginAt) : "Nooit", hint: d.stand?.laatsteLogin ? dateTimeNl(d.stand.laatsteLogin) : d.user.lastLoginAt ? `${dateTimeNl(d.user.lastLoginAt)} (voor deze periode)` : "" },
          { label: "Pagina's bekeken", value: count(d.stand?.paginas ?? 0), hint: `${count(d.stand?.sessies ?? 0)} bezoeken` },
          { label: "Kliks", value: count(d.stand?.kliks ?? 0), hint: `${count(d.stand?.acties ?? 0)} andere interacties` },
          { label: "Dagen actief", value: count(d.stand?.dagenActief ?? 0), hint: `van de ${period.days}` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Hoe laat" subtitle="Inlogs per uur, Nederlandse tijd">
          <Chart title="Inlogs per uur van de dag" kind="bars" labels={UUR_LABELS} series={[{ label: "Inlogs", values: d.loginsPerUur, slot: 3 }]} height={160} emptyText="Geen inlogs in deze periode." />
        </Panel>
        <Panel title="Meest bekeken pagina's">
          <BarList rows={d.topPaden.map((p) => ({ key: p.path, label: p.path, value: p.count, display: count(p.count) }))} emptyText="Nog geen pagina's gezien." />
        </Panel>
        <Panel title="Meest geklikt">
          <BarList rows={d.topKliks.map((k) => ({ key: k.label, label: k.label, value: k.count, display: count(k.count) }))} emptyText="Nog geen kliks gezien." />
        </Panel>
      </div>

      <Panel flush title="Tijdlijn" subtitle={`Alles wat we van dit account zagen in ${period.label}, nieuwste eerst${d.afgekapt ? " (afgekapt: kies een kortere periode voor alles)" : ""}.`}>
        {dagen.length === 0 ? (
          <div className="p-4 sm:p-5"><Empty title="Niets gezien" body="In deze periode logde dit account niet in en deed het niets wat we meten." /></div>
        ) : (
          dagen.map((dag) => (
            <section key={dag.dag} aria-labelledby={`dag-${dag.dag}`}>
              <h3 id={`dag-${dag.dag}`} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide sm:px-5" style={{ color: "var(--a-dim)", background: "var(--a-panel-2)", borderTop: "1px solid var(--a-border)" }}>
                {dateNl(new Date(`${dag.dag}T12:00:00+01:00`), { weekday: "long", day: "numeric", month: "long" })} · {count(dag.items.length)} gebeurtenissen
              </h3>
              <ol>
                {dag.items.map((it) => {
                  const s = SOORT[it.soort];
                  return (
                    <li key={it.key} className="flex items-start gap-3 px-4 py-1.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                      <span className="w-12 shrink-0 font-mono text-xs" style={{ color: "var(--a-mute)" }}>{amsterdamClock(it.at)}</span>
                      <span className="w-20 shrink-0"><Pill tone={s.tone} dot={false}>{s.label}</Pill></span>
                      <span className="min-w-0 flex-1 break-words" style={{ color: "var(--a-text)" }}>
                        {it.tekst}
                        {it.pad && it.soort !== "pagina" ? <span className="ml-1 text-xs" style={{ color: "var(--a-mute)" }}>op {it.pad}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </Panel>
    </div>
  );
}
