import { getPrincipal, hasRole } from "@/lib/auth";
import { payToken } from "@/lib/billing/pay-link";
import { dueDateOf } from "@/lib/billing/reminders";
import { resolvePeriod } from "@/lib/admin/period";
import { AGE_BUCKETS, invoicesInsights } from "@/lib/admin/insights/money";
import { count, dateNl, euro, euroExact } from "@/lib/admin/format";
import { BarList, KpiStrip, PageHead, Panel, PeriodTabs, Pill, type Tone } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";
import { OverdueInvoices } from "@/components/admin/OverdueInvoices";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  PLATFORM_FEE: "Platformfee",
  SELF_BILL_FREELANCER: "Dienst (zzp)",
  CANCELLATION_PENALTY: "Annuleringsvergoeding",
  UITZEND_FEE: "Uitzendkracht",
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  PAID: { label: "Betaald", tone: "ok" },
  ISSUED: { label: "Open", tone: "warn" },
  DRAFT: { label: "Concept", tone: "neutral" },
  CANCELLED: { label: "Geannuleerd", tone: "neutral" },
};

// Platform-brede factuurlijst, over alle organisaties heen.
export default async function AdminFacturenPage(props: { searchParams: Promise<{ periode?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Facturatie-overzicht is alleen voor platformbeheerders." />;
  }
  const { periode } = await props.searchParams;
  const period = resolvePeriod(periode);
  const d = await invoicesInsights(period);
  const now = new Date();

  const rows: TableRow[] = d.invoices.map((inv) => {
    const debtor = inv.recipientTenant?.name ?? inv.recipientFreelancer?.user.fullName ?? "—";
    const due = dueDateOf(inv);
    const late = inv.status === "ISSUED" && due < now;
    const status = STATUS[inv.status] ?? { label: inv.status, tone: "neutral" as const };
    const typeLabel = TYPE_LABEL[inv.type] ?? inv.type;
    return {
      id: inv.id,
      search: `${inv.number} ${debtor} ${typeLabel}`,
      filters: { status: late ? "LATE" : inv.status, type: inv.type },
      cells: {
        number: <span className="font-mono text-xs" style={{ color: "var(--a-text)" }}>{inv.number}</span>,
        debtor: <span className="block max-w-[14rem] truncate" title={debtor}>{debtor}</span>,
        type: typeLabel,
        total: <span className="font-medium" style={{ color: "var(--a-text)" }}>{euroExact(inv.totalCents)}</span>,
        date: dateNl(inv.createdAt),
        due: inv.status === "ISSUED" ? <span style={late ? { color: "var(--a-crit)", fontWeight: 500 } : undefined}>{dateNl(due)}</span> : "—",
        status: late ? <Pill tone="crit">Te laat</Pill> : <Pill tone={status.tone}>{status.label}</Pill>,
        actions: (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {inv.status === "ISSUED" && (inv.recipientTenantId || inv.recipientFreelancerId) && (
              <a href={`/betaal/${payToken(inv.id)}`} target="_blank" rel="noopener noreferrer" className="a-button text-xs" title="Openbare betaalpagina met QR-code, om door te sturen naar de klant">
                Betaallink
              </a>
            )}
            <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer" className="a-button text-xs">PDF</a>
          </span>
        ),
      },
      sort: { number: inv.number, debtor, type: typeLabel, total: inv.totalCents, date: inv.createdAt.getTime(), due: inv.status === "ISSUED" ? due.getTime() : null, status: late ? "Te laat" : status.label },
      csv: { number: inv.number, debtor, type: typeLabel, total: (inv.totalCents / 100).toFixed(2), date: inv.createdAt.toISOString().slice(0, 10), due: inv.status === "ISSUED" ? due.toISOString().slice(0, 10) : "", status: late ? "Te laat" : status.label, actions: "" },
    };
  });

  return (
    <div className="space-y-4">
      <PageHead
        title="Facturen"
        subtitle="Alle facturen op het platform, over alle organisaties heen."
        actions={<PeriodTabs period={period} basePath="/admin/facturen" />}
      />

      <KpiStrip
        items={[
          { label: "Gefactureerd", value: euro(d.billed), delta: d.billedDelta, spark: d.paidSeries.map((v, i) => v + (d.openSeries[i] ?? 0)), hint: `${count(d.billedCount)} facturen` },
          { label: "Betaald", value: euro(d.paidCents), hint: `in ${period.label}` },
          { label: "Staat open", value: euro(d.openCents), hint: `${count(d.openCount)} facturen`, ...(d.openCents > 0 ? { tone: "money" as const } : {}) },
          { label: "Te laat", value: euro(d.overdueCents), hint: d.overdueCount > 0 ? `${count(d.overdueCount)} facturen` : "Niets te laat", ...(d.overdueCents > 0 ? { tone: "crit" as const } : {}) },
          { label: "Gemiddelde betaaltijd", value: d.avgPayDays === null ? "—" : `${d.avgPayDays} ${d.avgPayDays === 1 ? "dag" : "dagen"}`, hint: "van factuur tot betaling" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Gefactureerd" subtitle={`Laatste ${period.label}`}>
          <Chart
            title="Gefactureerd per periode, betaald en open"
            kind="bars"
            unit="money"
            labels={d.labels}
            series={[
              { label: "Betaald", values: d.paidSeries, slot: 1 },
              { label: "Open", values: d.openSeries, slot: 4 },
            ]}
            height={230}
            emptyText="Nog geen facturen in deze periode."
          />
        </Panel>
        <Panel title="Ouderdom van wat open staat" subtitle="Hoe lang facturen al openstaan">
          <BarList rows={AGE_BUCKETS.map((label, i) => ({ key: label, label, value: d.ages[i] ?? 0, display: euro(d.ages[i] ?? 0) }))} />
        </Panel>
      </div>

      <OverdueInvoices />

      <Panel flush title="Alle facturen" subtitle={`${count(d.invoices.length)} facturen`}>
        <DataTable
          columns={[
            { key: "number", label: "Nummer" },
            { key: "debtor", label: "Debiteur" },
            { key: "type", label: "Soort", hideOnMobile: true },
            { key: "total", label: "Totaal", align: "right" },
            { key: "date", label: "Datum", hideOnMobile: true },
            { key: "due", label: "Vervalt", hideOnMobile: true },
            { key: "status", label: "Status" },
            { key: "actions", label: "", align: "right", sortable: false },
          ]}
          rows={rows}
          searchPlaceholder="Zoek op nummer of debiteur"
          csvName="facturen"
          defaultSort={{ key: "date", dir: "desc" }}
          filters={[
            { key: "status", label: "Status", chips: true, options: [{ value: "ISSUED", label: "Open" }, { value: "LATE", label: "Te laat" }, { value: "PAID", label: "Betaald" }, { value: "DRAFT", label: "Concept" }, { value: "CANCELLED", label: "Geannuleerd" }] },
            { key: "type", label: "Soort", options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })) },
          ]}
          emptyText="Er zijn nog geen facturen."
        />
      </Panel>
    </div>
  );
}
