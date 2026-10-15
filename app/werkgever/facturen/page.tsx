import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { PageHeader, Panel, KpiCard, money } from "@/components/app/ui";
import { BillingPrefsForm } from "@/components/app/BillingPrefsForm";
import { InvoicesOverview, type InvoiceRow } from "@/components/app/InvoicesOverview";
import { payUrl } from "@/lib/billing/pay-link";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function WerkgeverFacturenPage() {
  const iv = (await getDict()).invoices;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const billing = scope.tenantIds[0] ? await getOrgProfileExtra(scope.tenantIds[0]) : {};

  const invoices = await prisma.invoice.findMany({
    where: { recipientTenantId: { in: scope.tenantIds } },
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      subtotalCents: true,
      vatCents: true,
      totalCents: true,
      vatTreatment: true,
      createdAt: true,
      timesheet: { select: { branch: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const outstanding = invoices.filter((i) => i.status === "ISSUED").reduce((s, i) => s + i.totalCents, 0);
  const paid = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalCents, 0);

  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    typeLabel:
      i.type === "PLATFORM_FEE"
        ? iv.typeFee
        : i.type === "CANCELLATION_PENALTY"
          ? iv.typePenalty
          : i.type === "UITZEND_FEE"
            ? iv.typeUitzend
            : iv.typeShift,
    reverseCharge: i.vatTreatment === "REVERSE_CHARGE",
    branch: i.timesheet?.branch.name ?? "—",
    subtotalCents: i.subtotalCents,
    vatCents: i.vatCents,
    totalCents: i.totalCents,
    status: i.status,
    ...(i.status === "ISSUED" ? { payUrl: payUrl(i.id) } : {}),
  }));

  return (
    <>
      <PageHeader title={iv.title} subtitle={iv.subtitle} />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label={iv.kpiOutstanding} value={money(outstanding)} tone={outstanding > 0 ? "warn" : "default"} />
        <KpiCard label={iv.kpiPaid} value={money(paid)} tone="brand" />
        <KpiCard label={iv.kpiCount} value={String(invoices.length)} />
      </div>

      <div id="factuurgegevens" className="mt-8 scroll-mt-24">
        <Panel title={iv.detailsPanel}>
          <BillingPrefsForm
            initial={{
              billingEmail: billing.billingEmail ?? "",
              splitByCostCentre: billing.splitByCostCentre ?? false,
              costCentres: billing.costCentres ?? [],
            }}
          />
        </Panel>
      </div>

      <div className="mt-8">
        <InvoicesOverview invoices={rows} t={iv} />
      </div>
    </>
  );
}
