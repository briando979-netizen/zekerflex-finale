import { getPrincipal, hasRole } from "@/lib/auth";
import { resolvePeriod } from "@/lib/admin/period";
import { companiesInsights } from "@/lib/admin/insights/people";
import { count, dateNl, euro } from "@/lib/admin/format";
import { BarList, KpiStrip, NameCell, PageHead, Panel, PeriodTabs, Pill, StackBar } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";
import { landNaam } from "@/lib/onboarding/buitenland";

export const dynamic = "force-dynamic";

const VIA_LABEL: Record<string, string> = { kvk: "KVK", admin: "Handmatig", history: "Bestaande klant", platform: "Platform" };

export default async function BedrijvenPage(props: { searchParams: Promise<{ periode?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het bedrijvenoverzicht is alleen voor platformbeheerders." />;
  }
  const { periode } = await props.searchParams;
  const period = resolvePeriod(periode);
  const d = await companiesInsights(period);

  const rows: TableRow[] = d.rows.map((c) => {
    const verified = c.verifiedVia ? "ja" : "nee";
    return {
      id: c.id,
      href: `/admin/bedrijven/${c.id}`,
      search: `${c.name} ${c.kvkNumber ?? ""} ${c.vatNumber ?? ""} ${landNaam(c.country)}`,
      filters: { verified },
      cells: {
        name: <NameCell name={c.name} sub={c.kvkNumber ? `KVK ${c.kvkNumber}` : c.country !== "NL" ? `${landNaam(c.country)}${c.vatNumber ? `, btw ${c.vatNumber}` : ""}` : "Geen KVK-nummer"} href={`/admin/bedrijven/${c.id}`} />,
        verified: c.verifiedVia ? <Pill tone="trust">{VIA_LABEL[c.verifiedVia] ?? "Geverifieerd"}</Pill> : <Pill tone="warn">Niet geverifieerd</Pill>,
        branches: count(c.branches),
        members: count(c.members),
        shifts: count(c.shifts),
        billed: euro(c.billedCents),
        open: c.openCents > 0 ? <span style={{ color: "var(--a-money)" }}>{euro(c.openCents)}</span> : "—",
        since: dateNl(c.createdAt),
      },
      sort: { name: c.name, verified, branches: c.branches, members: c.members, shifts: c.shifts, billed: c.billedCents, open: c.openCents, since: c.createdAt.getTime() },
      csv: { name: `${c.name} (KVK ${c.kvkNumber ?? "onbekend"})`, verified: c.verifiedVia ? (VIA_LABEL[c.verifiedVia] ?? "ja") : "nee", branches: c.branches, members: c.members, shifts: c.shifts, billed: (c.billedCents / 100).toFixed(2), open: (c.openCents / 100).toFixed(2), since: c.createdAt.toISOString() },
    };
  });

  const top = [...d.rows].filter((c) => c.billedCents > 0).sort((a, b) => b.billedCents - a.billedCents).slice(0, 6);

  return (
    <div className="space-y-4">
      <PageHead
        title="Bedrijven"
        subtitle="Alle organisaties die als opdrachtgever op ZekerFlex actief zijn."
        actions={<PeriodTabs period={period} basePath="/admin/bedrijven" />}
      />

      <KpiStrip
        items={[
          { label: "Bedrijven", value: count(d.total), hint: `${d.verified} geverifieerd` },
          { label: "Actief", value: count(d.active), hint: `met klussen in ${period.label}` },
          { label: "Nieuw", value: count(d.newCount), delta: d.newDelta, hint: `in ${period.label}` },
          { label: "Klussen", value: count(d.shifts), delta: d.shiftsDelta, spark: d.shiftSeries },
          { label: "Gefactureerd", value: euro(d.billed), delta: d.billedDelta, spark: d.billedSeries, href: "/admin/facturen" },
          { label: "Staat open", value: euro(d.open), href: "/admin/facturen", ...(d.open > 0 ? { tone: "money" as const } : {}) },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Klussen" subtitle={`Geplaatste klussen, laatste ${period.label}`}>
          <Chart title="Klussen per periode" kind="bars" unit="count" labels={d.labels} series={[{ label: "Klussen", values: d.shiftSeries }]} height={210} emptyText="Geen klussen in deze periode." />
        </Panel>
        <div className="grid gap-4">
          <Panel title="Grootste opdrachtgevers" subtitle={`Gefactureerd in ${period.label}`}>
            <BarList rows={top.map((c) => ({ key: c.id, label: c.name, value: c.billedCents, display: euro(c.billedCents), href: `/admin/bedrijven/${c.id}` }))} emptyText="Nog niets gefactureerd in deze periode." />
          </Panel>
          <Panel title="Verificatie">
            <StackBar segments={d.verification} format={count} emptyText="Nog geen bedrijven." />
          </Panel>
        </div>
      </div>

      <Panel flush title="Alle bedrijven" subtitle={`${count(d.total)} organisaties. Cijfers over ${period.label}.`}>
        <DataTable
          columns={[
            { key: "name", label: "Organisatie" },
            { key: "verified", label: "Verificatie" },
            { key: "branches", label: "Vestigingen", align: "right", hideOnMobile: true },
            { key: "members", label: "Gebruikers", align: "right", hideOnMobile: true },
            { key: "shifts", label: "Klussen", align: "right", hideOnMobile: true },
            { key: "billed", label: "Gefactureerd", align: "right", hideOnMobile: true },
            { key: "open", label: "Open", align: "right" },
            { key: "since", label: "Aangemeld", hideOnMobile: true },
          ]}
          rows={rows}
          searchPlaceholder="Zoek op naam, KVK, btw of land"
          csvName="bedrijven"
          defaultSort={{ key: "since", dir: "desc" }}
          filters={[{ key: "verified", label: "Verificatie", chips: true, options: [{ value: "ja", label: "Geverifieerd" }, { value: "nee", label: "Niet geverifieerd" }] }]}
          emptyText="Er zijn nog geen bedrijven."
        />
      </Panel>
    </div>
  );
}
