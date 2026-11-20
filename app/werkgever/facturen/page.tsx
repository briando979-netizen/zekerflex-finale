import { requirePrincipal } from "@/lib/auth";
import { naarStudioAccount } from "@/lib/studio/account-server";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { PageHeader, Panel, KpiCard, money } from "@/components/app/ui";
import { BillingPrefsForm } from "@/components/app/BillingPrefsForm";
import { EfactuurSettings } from "@/components/werkgever/EfactuurSettings";
import { OpenBijAnker } from "@/components/werkgever/OpenBijAnker";
import { InvoicesOverview, type InvoiceRow } from "@/components/app/InvoicesOverview";
import { payUrl } from "@/lib/billing/pay-link";
import { huidigeFactuurBetaalwijze } from "@/lib/billing/overschrijving-bron";
import { peppolIngesteld } from "@/lib/efactuur/instellingen";
import { boekhoudingIngevuld, toonFactuurTellers } from "@/lib/werkgever/facturen-instellingen";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function WerkgeverFacturenPage() {
  const iv = (await getDict()).invoices;
  const principal = await requirePrincipal();
  // dashboard website of webshop open: het account staat in de studio (lib/studio/account.ts)
  await naarStudioAccount(principal, "facturen");
  const scope = await resolveEmployerScope(principal);
  const billing = scope.tenantIds[0] ? await getOrgProfileExtra(scope.tenantIds[0]) : {};
  // online betalen dicht: geen iDEAL-knoppen maar de overschrijving (components/app/InvoicesOverview.tsx)
  const betaalwijze = await huidigeFactuurBetaalwijze();

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
  const instellingenOpen = boekhoudingIngevuld(billing);

  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    ...(i.type === "DOMEIN" ? { digitaal: true } : {}),
    typeLabel:
      i.type === "PLATFORM_FEE"
        ? iv.typeFee
        : i.type === "CANCELLATION_PENALTY"
          ? iv.typePenalty
          : i.type === "UITZEND_FEE"
            ? iv.typeUitzend
            : i.type === "DOMEIN"
              ? iv.typeDomein
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

      {/* een nieuw bedrijf zag hier "€ 0", "€ 0" en "0": de telvakken komen pas bij de eerste factuur */}
      {toonFactuurTellers(invoices.length) && (
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label={iv.kpiOutstanding} value={money(outstanding)} tone={outstanding > 0 ? "warn" : "default"} />
          <KpiCard label={iv.kpiPaid} value={money(paid)} tone="brand" />
          <KpiCard label={iv.kpiCount} value={String(invoices.length)} />
        </div>
      )}

      {/* instellingen voor de boekhouder: standaard dicht, open als het bedrijf er al iets heeft ingevuld
          (lib/werkgever/facturen-instellingen.ts). Het anker #factuurgegevens (hulpcentrum) wijst naar dit blok. */}
      <details id="factuurgegevens" className="card mt-8 scroll-mt-24 p-4" open={instellingenOpen}>
        <summary className="cursor-pointer text-sm font-semibold text-ink">{iv.moreSettings}</summary>

        <div className="mt-4">
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

        {/* e-factuur (lib/efactuur): Peppol-adres, ontvangstadres en automatisch versturen */}
        <div id="e-factuur" className="mt-4 scroll-mt-24">
          <Panel title={peppolIngesteld() ? iv.efactuurPanelPeppol : iv.efactuurPanel}>
            <EfactuurSettings />
          </Panel>
        </div>
      </details>
      {/* een inklapblok gaat niet vanzelf open bij een anker: de hulplink zou op een dicht blok uitkomen */}
      <OpenBijAnker blokId="factuurgegevens" ankers={["factuurgegevens", "e-factuur"]} />

      <div className="mt-8">
        <InvoicesOverview invoices={rows} t={iv} betaalwijze={betaalwijze} />
      </div>
    </>
  );
}
