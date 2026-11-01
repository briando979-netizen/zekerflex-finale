import { getPrincipal, hasRole } from "@/lib/auth";
import { resolvePeriod } from "@/lib/admin/period";
import { usersInsights, type PersonKind } from "@/lib/admin/insights/people";
import { count, dateNl, percentOf, timeAgoNl } from "@/lib/admin/format";
import { Funnel, KpiStrip, NameCell, PageHead, Panel, PeriodTabs, Pill, StackBar, type Tone } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  FREELANCER: "Flexwerker",
  LOCAL_MANAGER: "Vestigingsmanager",
  HQ_ADMIN: "Bedrijfsbeheerder",
  DISPUTE_MANAGER: "Dispuutmanager",
  PLATFORM_ADMIN: "Platformbeheerder",
  SALES: "Sales",
};

const KYC: Record<string, { label: string; tone: Tone }> = {
  VERIFIED: { label: "Geverifieerd", tone: "trust" },
  PENDING: { label: "In beoordeling", tone: "warn" },
  NOT_STARTED: { label: "Niet gestart", tone: "neutral" },
  REJECTED: { label: "Afgewezen", tone: "crit" },
  EXPIRED: { label: "Verlopen", tone: "crit" },
};

const KIND_LABEL: Record<PersonKind, string> = {
  flexwerker: "Flexwerkers",
  opdrachtgever: "Opdrachtgevers",
  beheerder: "Beheerders",
  overig: "Overig",
};

export default async function GebruikersPage(props: { searchParams: Promise<{ periode?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het gebruikersoverzicht is alleen voor platformbeheerders." />;
  }
  const { periode } = await props.searchParams;
  const period = resolvePeriod(periode);
  const d = await usersInsights(period);

  const rows: TableRow[] = d.rows.map((u) => {
    const role = u.memberships.map((m) => `${ROLE_LABEL[m.role] ?? m.role}${m.tenant.type === "PLATFORM" ? "" : ` · ${m.tenant.name}`}`).join(", ") || "Geen rol";
    const kyc = KYC[u.kycStatus] ?? { label: u.kycStatus, tone: "neutral" as const };
    const status = u.disabledAt ? "geblokkeerd" : u.emailVerifiedAt ? "actief" : "onbevestigd";
    return {
      id: u.id,
      href: `/admin/gebruikers/${u.id}`,
      search: `${u.fullName} ${u.email} ${u.phone ?? ""} ${role}`,
      filters: { kind: u.kind, kyc: u.kycStatus, status },
      cells: {
        name: <NameCell name={u.fullName} sub={u.email} href={`/admin/gebruikers/${u.id}`} />,
        role: <span className="block max-w-[16rem] truncate" title={role}>{role}</span>,
        kyc: <Pill tone={kyc.tone}>{kyc.label}</Pill>,
        last: u.lastLoginAt ? timeAgoNl(u.lastLoginAt) : "Nooit",
        since: dateNl(u.createdAt),
        status: u.disabledAt ? <Pill tone="crit">Geblokkeerd</Pill> : u.emailVerifiedAt ? <Pill tone="ok">Actief</Pill> : <Pill tone="warn">E-mail onbevestigd</Pill>,
      },
      sort: { name: u.fullName, role, kyc: kyc.label, last: u.lastLoginAt?.getTime() ?? null, since: u.createdAt.getTime(), status },
      csv: { name: `${u.fullName} <${u.email}>`, role, kyc: kyc.label, last: u.lastLoginAt?.toISOString() ?? "", since: u.createdAt.toISOString(), status },
    };
  });

  return (
    <div className="space-y-4">
      <PageHead
        title="Gebruikers"
        subtitle="Iedereen met een account: flexwerkers, opdrachtgevers en beheerders."
        actions={<PeriodTabs period={period} basePath="/admin/gebruikers" />}
      />

      <KpiStrip
        items={[
          { label: "Alle gebruikers", value: count(d.total), hint: d.blocked > 0 ? `${d.blocked} geblokkeerd` : "Niemand geblokkeerd" },
          { label: "Flexwerkers", value: count(d.flexCount), hint: `${percentOf(d.kycVerified, d.flexCount)}% geverifieerd` },
          { label: "Opdrachtgevers", value: count(d.employerCount) },
          { label: "Nieuw", value: count(d.newCount), delta: d.newDelta, spark: d.signupSeries, hint: `in ${period.label}` },
          { label: "Actief", value: count(d.active), delta: d.activeDelta, hint: `ingelogd in ${period.label}` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Aanmeldingen" subtitle={`Nieuwe accounts, laatste ${period.label}`}>
          <Chart
            title="Nieuwe accounts per type"
            kind="bars"
            unit="count"
            labels={d.labels}
            series={[
              { label: "Flexwerkers", values: d.flexSeries, slot: 1 },
              { label: "Opdrachtgevers", values: d.employerSeries, slot: 3 },
            ]}
            height={230}
            emptyText="Geen aanmeldingen in deze periode."
          />
        </Panel>
        <Panel title="Van aanmelding naar werk" subtitle="Flexwerkers, sinds het begin">
          <Funnel stages={d.funnel} />
        </Panel>
      </div>

      <Panel title="Identiteitscontrole" subtitle="Stand van alle flexwerkers">
        <StackBar segments={d.kyc} format={count} emptyText="Nog geen flexwerkers." />
      </Panel>

      <Panel flush title="Alle gebruikers" subtitle={d.capped ? "De nieuwste 2.000 accounts" : `${count(d.total)} accounts`}>
        <DataTable
          columns={[
            { key: "name", label: "Naam" },
            { key: "role", label: "Rol", hideOnMobile: true },
            { key: "kyc", label: "Identiteit" },
            { key: "last", label: "Laatst ingelogd", hideOnMobile: true },
            { key: "since", label: "Lid sinds", hideOnMobile: true },
            { key: "status", label: "Status", hideOnMobile: true },
          ]}
          rows={rows}
          searchPlaceholder="Zoek op naam, e-mail of bedrijf"
          csvName="gebruikers"
          defaultSort={{ key: "since", dir: "desc" }}
          filters={[
            { key: "kind", label: "Type", chips: true, options: (["flexwerker", "opdrachtgever", "beheerder"] as const).map((value) => ({ value, label: KIND_LABEL[value] })) },
            { key: "kyc", label: "Identiteit", options: Object.entries(KYC).map(([value, k]) => ({ value, label: k.label })) },
            { key: "status", label: "Status", options: [{ value: "actief", label: "Actief" }, { value: "onbevestigd", label: "E-mail onbevestigd" }, { value: "geblokkeerd", label: "Geblokkeerd" }] },
          ]}
          emptyText="Er zijn nog geen gebruikers."
        />
      </Panel>
    </div>
  );
}
