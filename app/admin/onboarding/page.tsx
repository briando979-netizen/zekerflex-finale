import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { onboardingData } from "@/lib/admin/insights/onboarding";
import {
  LEEFTIJD_LABEL,
  WERKER_STAPPEN,
  WERKGEVER_STAPPEN,
  csvRegel,
  leeftijdVan,
  stappenVan,
  trechter,
  vastStatus,
  type Doelgroep,
  type Leeftijd,
  type TrechterStap,
} from "@/lib/admin/onboarding-model";
import { count, dateTimeNl, percentOf, timeAgoNl } from "@/lib/admin/format";
import { Funnel, KpiStrip, NameCell, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";
import { OnboardingActies } from "@/components/admin/OnboardingActies";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  FREELANCER: "Flexwerker",
  LOCAL_MANAGER: "Vestigingsmanager",
  HQ_ADMIN: "Bedrijfsbeheerder",
  DISPUTE_MANAGER: "Dispuutmanager",
};

const DOELGROEP_LABEL: Record<Doelgroep, string> = { werker: "Werker", werkgever: "Werkgever" };
const DAY = 86_400_000;

function grootsteUitval(stappen: TrechterStap[]): TrechterStap | null {
  return stappen.reduce<TrechterStap | null>((best, s) => (s.uitval > 0 && (!best || s.uitval > best.uitval) ? s : best), null);
}

// Admin → Mensen & bedrijven → Onboarding: wie zit waar in het aanmeld- en verificatieproces,
// met de echte cijfers uit de database en de knoppen om iemand verder te helpen.
export default async function OnboardingPage(props: { searchParams: Promise<{ test?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Onboarding is alleen beschikbaar voor platformbeheerders." />;
  }
  const { test } = await props.searchParams;
  const testMeetellen = test === "1";
  const now = new Date();
  const data = await onboardingData({ testMeetellen });
  const { rijen } = data;

  const werkers = rijen.filter((r) => r.doelgroep === "werker");
  const werkgevers = rijen.filter((r) => r.doelgroep === "werkgever");
  const nieuw = (dagen: number) => rijen.filter((r) => now.getTime() - r.aangemeld.getTime() <= dagen * DAY).length;
  const status = rijen.map((r) => ({ rij: r, status: vastStatus(r, now) }));
  const vast = status.filter((s) => s.status.vast).length;
  const emailKlaar = rijen.filter((r) => r.gehaald[1]).length;
  // Indexen volgen WERKER_STAPPEN: 3 = profiel, 4 = identiteit; WERKGEVER_STAPPEN: 4 = bedrijf geverifieerd.
  const profielAf = werkers.filter((r) => r.gehaald[3]).length;
  const identiteit = werkers.filter((r) => r.gehaald[4]).length;
  const bedrijfOk = werkgevers.filter((r) => r.gehaald[4]).length;

  const trechterWerker = trechter("werker", werkers);
  const trechterWerkgever = trechter("werkgever", werkgevers);

  // Elke stap na "Aangemeld" kan de plek zijn waar iemand vastzit.
  const stapOpties = (["werker", "werkgever"] as const).flatMap((d) =>
    stappenVan(d).flatMap((s, i) => (i === 0 ? [] : [{ value: `${d}:${i}`, label: `${DOELGROEP_LABEL[d]}: ${s.open}` }])),
  );

  const tabel: TableRow[] = status
    .filter((s) => s.status.stap !== -1)
    .map(({ rij, status: st }) => {
      const leeftijd = leeftijdVan(rij.aangemeld, now);
      const rol = rij.rollen.map((r) => ROLE_LABEL[r] ?? r).join(" + ");
      const csv = csvRegel(rij, now);
      return {
        id: rij.id,
        href: `/admin/gebruikers/${rij.id}`,
        search: `${rij.naam} ${rij.email} ${rij.tenantNaam ?? ""}`,
        filters: { doelgroep: rij.doelgroep, stap: `${rij.doelgroep}:${st.stap}`, leeftijd, vast: st.vast ? "vast" : "bezig" },
        cells: {
          naam: <NameCell name={rij.naam} sub={rij.tenantNaam ?? undefined} href={`/admin/gebruikers/${rij.id}`} />,
          soort: <Pill tone={rij.doelgroep === "werker" ? "plan" : "money"} dot={false}>{DOELGROEP_LABEL[rij.doelgroep]}</Pill>,
          rol,
          aangemeld: (
            <span className="block">
              <span className="block">{timeAgoNl(rij.aangemeld, now.getTime())}</span>
              <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{dateTimeNl(rij.aangemeld, now)}</span>
            </span>
          ),
          laatste: rij.laatsteInlog ? timeAgoNl(rij.laatsteInlog, now.getTime()) : "Nooit",
          stap: <Pill tone={st.vast ? "warn" : "neutral"}>{st.label}</Pill>,
          herinneringen: count(rij.herinneringen),
          acties: (
            <OnboardingActies
              userId={rij.id}
              emailBevestigd={rij.gehaald[1] === true}
              bedrijfId={rij.doelgroep === "werkgever" && !rij.gehaald[4] ? rij.tenantId : null}
              compact
            />
          ),
        },
        sort: { naam: rij.naam, soort: rij.doelgroep, rol, aangemeld: rij.aangemeld.getTime(), laatste: rij.laatsteInlog?.getTime() ?? null, stap: st.stap, herinneringen: rij.herinneringen },
        csv,
      };
    });

  const uitval = (t: TrechterStap[]) => {
    const g = grootsteUitval(t);
    return g ? `Grootste uitval: ${g.label} (${count(g.uitval)} accounts blijven daar steken).` : "Nog geen uitval.";
  };

  return (
    <div className="space-y-4">
      <PageHead
        title="Onboarding"
        subtitle="Wie zit waar in het aanmeld- en verificatieproces, met alle gegevens en de knoppen om iemand verder te helpen."
        actions={
          <Link href={testMeetellen ? "/admin/onboarding" : "/admin/onboarding?test=1"} className="a-button text-xs" aria-pressed={testMeetellen}>
            {testMeetellen ? "Testaccounts tellen mee: uitzetten" : "Testaccounts tellen niet mee: aanzetten"}
          </Link>
        }
      />

      {!testMeetellen && data.uitgesloten > 0 && (
        <Notice>
          {count(data.uitgesloten)} testaccounts, eigen adressen, geblokkeerde en verwijderde accounts zijn niet meegeteld. Beheerders en sales tellen nooit mee.
        </Notice>
      )}
      {data.afgekapt && <Notice tone="warn">Alleen de nieuwste 5.000 accounts zijn meegeteld.</Notice>}

      <KpiStrip
        items={[
          { label: "Nieuwe aanmeldingen", value: count(nieuw(7)), hint: `laatste 7 dagen · ${count(nieuw(30))} in 30 dagen` },
          { label: "E-mail bevestigd", value: `${percentOf(emailKlaar, rijen.length)}%`, hint: `${count(emailKlaar)} van ${count(rijen.length)} accounts` },
          { label: "Profiel af", value: count(profielAf), hint: `werkers met postcode en IBAN (${percentOf(profielAf, werkers.length)}%)` },
          { label: "Identiteit geverifieerd", value: count(identiteit), hint: `${percentOf(identiteit, werkers.length)}% van ${count(werkers.length)} werkers`, tone: "trust" },
          { label: "Bedrijf bevestigd", value: count(bedrijfOk), hint: `werkgevers, van ${count(werkgevers.length)}`, tone: "trust" },
          { label: "Vastgelopen", value: count(vast), hint: "ouder dan een dag, nog niet klaar", ...(vast > 0 ? { tone: "warn" as const } : {}) },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Trechter werkers" subtitle={`Aantal dat deze stap én alle stappen ervoor haalde, van ${count(werkers.length)} werkers`}>
          <Funnel stages={trechterWerker.map((s) => ({ label: s.label, value: s.aantal }))} />
          <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>{uitval(trechterWerker)}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
            {trechterWerker.map((s) => `${s.label}: ${s.vanBegin}% van het begin${s.uitval > 0 ? `, ${count(s.uitval)} vielen af` : ""}`).join(" · ")}
          </p>
        </Panel>
        <Panel title="Trechter werkgevers" subtitle={`Aantal dat deze stap én alle stappen ervoor haalde, van ${count(werkgevers.length)} werkgevers`}>
          <Funnel stages={trechterWerkgever.map((s) => ({ label: s.label, value: s.aantal }))} />
          <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>{uitval(trechterWerkgever)}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
            {trechterWerkgever.map((s) => `${s.label}: ${s.vanBegin}% van het begin${s.uitval > 0 ? `, ${count(s.uitval)} vielen af` : ""}`).join(" · ")}
          </p>
        </Panel>
      </div>

      <Panel
        flush
        title="Wie zit vast"
        subtitle={`${count(tabel.length)} accounts zijn nog niet klaar. Een bedrijf met een open stap kun je hier goedkeuren; klik een rij voor het hele account.`}
      >
        <DataTable
          columns={[
            { key: "naam", label: "Naam" },
            { key: "soort", label: "Soort", hideOnMobile: true },
            { key: "rol", label: "Rol", hideOnMobile: true },
            { key: "aangemeld", label: "Aangemeld" },
            { key: "laatste", label: "Laatste inlog", hideOnMobile: true },
            { key: "stap", label: "Vast op stap" },
            { key: "herinneringen", label: "Herinneringen", hideOnMobile: true },
            { key: "acties", label: "Acties", sortable: false },
          ]}
          rows={tabel}
          searchPlaceholder="Zoek op naam, e-mail of bedrijf"
          csvName="onboarding"
          defaultSort={{ key: "aangemeld", dir: "desc" }}
          filters={[
            { key: "doelgroep", label: "Soort", chips: true, options: [{ value: "werker", label: "Werkers" }, { value: "werkgever", label: "Werkgevers" }] },
            { key: "vast", label: "Status", options: [{ value: "vast", label: "Vastgelopen" }, { value: "bezig", label: "Nog bezig (minder dan een dag)" }] },
            { key: "stap", label: "Stap", options: [...stapOpties] },
            { key: "leeftijd", label: "Leeftijd", options: (Object.keys(LEEFTIJD_LABEL) as Leeftijd[]).map((value) => ({ value, label: LEEFTIJD_LABEL[value] })) },
          ]}
          emptyText="Niemand zit vast: alle accounts zijn klaar."
        />
      </Panel>

      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        Stappen werker: {WERKER_STAPPEN.map((s) => s.label).join(", ")}. Stappen werkgever: {WERKGEVER_STAPPEN.map((s) => s.label).join(", ")}. De CSV bevat geen e-mailadres, IBAN, BSN of documentnummers.
      </p>
    </div>
  );
}
