import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { resolvePeriod } from "@/lib/admin/period";
import { meetkamerData } from "@/lib/analytics/meetkamer";
import { UUR_LABELS } from "@/lib/analytics/meetkamer-kern";
import { count, dateTimeNl, percentOf, timeAgoNl } from "@/lib/admin/format";
import { BarList, KpiStrip, Meter, NameCell, Notice, PageHead, Panel, PeriodTabs, Pill, type Tone } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";
import type { PersonKind } from "@/lib/admin/insights/people";

export const dynamic = "force-dynamic";

// Admin → Mensen & bedrijven → Meetkamer (20 nov 2026, eigenaar: "een meting van elke echte gebruiker"). Alles uit onze
// eigen bronnen (AuditLog voor inlogs, de eigen beacon voor pagina's en kliks), per account te openen, met onderaan de
// dekking: waar meten we wel en waar nog niet. Alleen voor platformbeheerders.

const SOORT: Record<PersonKind, string> = { flexwerker: "Flexwerker", opdrachtgever: "Opdrachtgever", beheerder: "Beheerder", overig: "Overig" };
const STAND: Record<"goed" | "deels" | "niets", { label: string; tone: Tone }> = {
  goed: { label: "Pagina's en kliks gemeten", tone: "ok" },
  deels: { label: "Alleen pagina's gezien", tone: "warn" },
  niets: { label: "Nog niets gemeten", tone: "neutral" },
};

export default async function MeetkamerPage(props: { searchParams: Promise<{ periode?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De meetkamer is alleen voor platformbeheerders." />;
  }
  const { periode } = await props.searchParams;
  const period = resolvePeriod(periode, 30);
  const d = await meetkamerData(period);

  const rijen: TableRow[] = d.gebruikers.map((g) => {
    const online = d.online.has(g.userId);
    const laatst = g.laatstGezien && (!g.laatsteLogin || g.laatstGezien > g.laatsteLogin) ? g.laatstGezien : g.laatsteLogin;
    return {
      id: g.userId,
      href: `/admin/meetkamer/${g.userId}`,
      search: `${g.naam} ${g.email} ${SOORT[g.soort]}`,
      filters: { soort: g.soort, actief: g.logins >= 2 ? "terug" : g.logins === 1 || g.paginas > 0 ? "een-keer" : "stil" },
      cells: {
        naam: <NameCell name={g.naam} sub={g.email} href={`/admin/meetkamer/${g.userId}`} />,
        soort: SOORT[g.soort],
        logins: g.logins > 0 ? <span>{count(g.logins)}{g.mislukt > 0 ? <span className="ml-1 text-xs" style={{ color: "var(--a-mute)" }}>({g.mislukt} mislukt)</span> : null}</span> : <span style={{ color: "var(--a-mute)" }}>0</span>,
        laatsteLogin: g.laatsteLogin ? dateTimeNl(g.laatsteLogin) : g.laatsteLoginOoit ? <span style={{ color: "var(--a-mute)" }}>{timeAgoNl(g.laatsteLoginOoit)} (voor deze periode)</span> : "Nooit",
        gedrag: g.paginas + g.kliks + g.acties > 0 ? `${count(g.paginas)} pagina's · ${count(g.kliks)} kliks` : <span style={{ color: "var(--a-mute)" }}>niets gezien</span>,
        dagen: count(g.dagenActief),
        laatst: online ? <Pill tone="ok">Nu online</Pill> : laatst ? <span title={g.laatstePad ?? ""}>{timeAgoNl(laatst)}{g.laatstePad ? <span className="block max-w-[14rem] truncate text-xs" style={{ color: "var(--a-mute)" }}>{g.laatstePad}</span> : null}</span> : "—",
      },
      sort: { naam: g.naam, soort: SOORT[g.soort], logins: g.logins, laatsteLogin: g.laatsteLogin?.getTime() ?? null, gedrag: g.paginas + g.kliks, dagen: g.dagenActief, laatst: online ? Number.MAX_SAFE_INTEGER : (laatst?.getTime() ?? null) },
      csv: { naam: `${g.naam} <${g.email}>`, soort: SOORT[g.soort], logins: g.logins, laatsteLogin: g.laatsteLogin?.toISOString() ?? "", gedrag: `${g.paginas} pagina's, ${g.kliks} kliks`, dagen: g.dagenActief, laatst: laatst?.toISOString() ?? "" },
    };
  });

  const scrolMax = Math.max(d.voorpagina.sessies, ...d.voorpagina.scrol.map((s) => s.count), 1);

  return (
    <div className="space-y-4">
      <PageHead
        title="Meetkamer"
        subtitle="Wat elke echte gebruiker doet: wanneer hij inlogt, hoe vaak hij terugkomt, welke pagina's hij bekijkt en waar hij op klikt. Alles van onze eigen server, zonder cookies en zonder partijen van buiten."
        actions={<PeriodTabs period={period} basePath="/admin/meetkamer" />}
      />

      {d.afgekapt && <Notice tone="warn">Er waren meer rijen dan we in één keer lezen; de cijfers hieronder zijn een ondergrens. Kies een kortere periode voor het volledige beeld.</Notice>}

      <KpiStrip
        items={[
          { label: "Accounts totaal", value: count(d.totaal), hint: `${count(d.nieuw)} nieuw in ${period.label}` },
          { label: "Ingelogd", value: count(d.ingelogd), hint: `${count(d.loginsTotaal)} inlogs in ${period.label}` },
          { label: "Opnieuw ingelogd", value: count(d.terugkomers), hint: `${percentOf(d.terugkomers, d.ingelogd)}% van wie inlogde, 2× of vaker` },
          { label: "Op meerdere dagen actief", value: count(d.meerdereDagen), hint: "ingelogd of iets gedaan op 2+ dagen" },
          { label: "Nu online", value: count(d.nuOnline), hint: "ingelogd en actief in de laatste 5 minuten", tone: d.nuOnline > 0 ? "ok" : "neutral" },
          { label: "Mislukte inlogs", value: count(d.loginsMislukt), hint: "verkeerd wachtwoord of geblokkeerd", tone: d.loginsMislukt > 0 ? "warn" : "neutral" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Actieve accounts per dag" subtitle={`Hoeveel verschillende accounts inlogden of iets deden, ${period.label}`}>
          <Chart title="Actieve accounts en inlogs per dag" kind="bars" labels={d.labels} series={[{ label: "Actieve accounts", values: d.actiefPerDag, slot: 1 }, { label: "Inlogs", values: d.loginsPerDag, slot: 3 }]} height={220} emptyText="Nog geen activiteit in deze periode." />
        </Panel>
        <Panel title="Hoe laat op de dag" subtitle="Inlogs en gedrag per uur, Nederlandse tijd">
          <Chart title="Inlogs en gedrag per uur van de dag" kind="bars" labels={UUR_LABELS} series={[{ label: "Inlogs", values: d.loginsPerUur, slot: 3 }, { label: "Pagina's en kliks", values: d.gedragPerUur, slot: 1 }]} height={220} emptyText="Nog geen inlogs in deze periode." />
        </Panel>
      </div>

      <Panel flush title="Per gebruiker" subtitle={`Klik op een naam voor de volledige tijdlijn. ${count(d.actief)} van de ${count(d.totaal)} accounts deden iets in ${period.label}.`}>
        <DataTable
          columns={[
            { key: "naam", label: "Naam" },
            { key: "soort", label: "Soort", hideOnMobile: true },
            { key: "logins", label: "Inlogs", align: "right" },
            { key: "laatsteLogin", label: "Laatste inlog", hideOnMobile: true },
            { key: "gedrag", label: "Gedrag", hideOnMobile: true },
            { key: "dagen", label: "Dagen actief", align: "right", hideOnMobile: true },
            { key: "laatst", label: "Laatst gezien" },
          ]}
          rows={rijen}
          searchPlaceholder="Zoek op naam of e-mail"
          csvName="meetkamer-gebruikers"
          defaultSort={{ key: "laatst", dir: "desc" }}
          filters={[
            { key: "actief", label: "Activiteit", chips: true, options: [{ value: "terug", label: "Komt terug (2+ inlogs)" }, { value: "een-keer", label: "Eén keer gezien" }, { value: "stil", label: "Niets in deze periode" }] },
            { key: "soort", label: "Soort", options: (["flexwerker", "opdrachtgever", "beheerder", "overig"] as const).map((v) => ({ value: v, label: SOORT[v] })) },
          ]}
          emptyText="Nog geen accounts."
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="De voorpagina" subtitle={`${count(d.voorpagina.weergaven)} keer bekeken door ${count(d.voorpagina.sessies)} bezoeken (${count(d.voorpagina.ingelogdeSessies)} ingelogd), ${period.label}`}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--a-dim)" }}>Waar wordt op geklikt ({count(d.voorpagina.kliksTotaal)} kliks)</p>
          <BarList rows={d.voorpagina.kliks.map((k) => ({ key: k.label, label: k.label, value: k.count, display: `${count(k.count)} · ${k.aandeel}%` }))} emptyText="Nog geen kliks op de voorpagina in deze periode." />
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--a-dim)" }}>Hoe ver scrollen ze</p>
          <div className="space-y-2">
            {d.voorpagina.scrol.map((s) => (
              <Meter key={s.diepte} label={`${s.diepte}% van de pagina`} value={s.count} max={scrolMax} display={`${count(s.count)} bezoeken`} />
            ))}
          </div>
          {d.voorpagina.scrol.every((s) => s.count === 0) && <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>De scrolmeting is nieuw (20 nov); cijfers verschijnen zodra de eerste bezoekers de nieuwe versie laden.</p>}
        </Panel>
        <Panel title="Waar gaan ze daarna heen" subtitle="De eerste pagina na de voorpagina, per bezoek (laatste 7 dagen)">
          <BarList rows={d.voorpagina.volgende.map((v) => ({ key: v.path, label: v.path, value: v.count, display: count(v.count) }))} emptyText="Nog geen vervolgpagina's gezien." />
        </Panel>
      </div>

      <Panel flush title="Dekking: waar meten we" subtitle={`${count(d.eventsTotaal)} gebeurtenissen in ${period.label}. Een deel zonder cijfers heeft óf geen bezoekers gehad, óf de meting ontbreekt daar nog.`}>
        <ul>
          {d.dekking.map((r) => {
            const st = STAND[r.stand];
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span className="min-w-0">
                  <span className="block font-medium" style={{ color: "var(--a-text)" }}>{r.naam}</span>
                  <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
                    {count(r.paginas)} pagina&apos;s · {count(r.weergaven)} weergaven · {count(r.kliks)} kliks · {count(r.accounts)} accounts
                  </span>
                </span>
                <Pill tone={st.tone}>{st.label}</Pill>
              </li>
            );
          })}
        </ul>
        <p className="px-4 py-3 text-xs sm:px-5" style={{ color: "var(--a-mute)", borderTop: "1px solid var(--a-border)" }}>
          Niet in deze meting: FlikFlak en Talkaro (eigen apps op hun eigen adres, met een eigen beheer) en de websites van klanten (eigen bezoekerscijfers in <Link href="/admin/analytics" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>Verkeer</Link>). Het algemene verkeer van bezoekers zonder account staat ook in Verkeer.
        </p>
      </Panel>
    </div>
  );
}
