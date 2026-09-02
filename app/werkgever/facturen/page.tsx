import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { PageHeader, Panel, EmptyState, KpiCard, StatusPill, money, moneyExact, dateShort } from "@/components/app/ui";
import { BillingPrefsForm } from "@/components/app/BillingPrefsForm";

export const dynamic = "force-dynamic";

export default async function WerkgeverFacturenPage() {
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

  return (
    <>
      <PageHeader
        title="Facturen"
        subtitle="Automatisch aangemaakt na goedkeuring van uren — dienstfactuur en platformfee gescheiden."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Openstaand" value={money(outstanding)} tone={outstanding > 0 ? "warn" : "default"} />
        <KpiCard label="Betaald" value={money(paid)} tone="brand" />
        <KpiCard label="Facturen" value={String(invoices.length)} />
      </div>

      <div id="factuurgegevens" className="mt-8 scroll-mt-24">
        <Panel title="Factuurgegevens">
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
        <Panel title="Alle facturen">
          {invoices.length === 0 ? (
            <EmptyState title="Nog geen facturen" body="Zodra je uren goedkeurt, verschijnen hier de facturen." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                    <th className="px-5 py-2.5 font-medium">Nummer</th>
                    <th className="px-5 py-2.5 font-medium">Soort</th>
                    <th className="px-5 py-2.5 font-medium">Vestiging</th>
                    <th className="px-5 py-2.5 text-right font-medium">Subtotaal</th>
                    <th className="px-5 py-2.5 text-right font-medium">Btw</th>
                    <th className="px-5 py-2.5 text-right font-medium">Totaal</th>
                    <th className="px-5 py-2.5 text-right font-medium">Status</th>
                    <th className="px-5 py-2.5 text-right font-medium">Pdf</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hair">
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{i.number}</td>
                      <td className="px-5 py-3 text-neutralx-600">
                        {i.type === "PLATFORM_FEE" ? "Platformfee" : "Dienst (zzp)"}
                        {i.vatTreatment === "REVERSE_CHARGE" && (
                          <span className="ml-1 text-xs text-neutralx-400">· verlegd</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-neutralx-600">{i.timesheet?.branch.name ?? "—"}</td>
                      <td className="num px-5 py-3 text-right text-neutralx-600">{moneyExact(i.subtotalCents)}</td>
                      <td className="num px-5 py-3 text-right text-neutralx-600">{moneyExact(i.vatCents)}</td>
                      <td className="num px-5 py-3 text-right font-medium">{moneyExact(i.totalCents)}</td>
                      <td className="px-5 py-3 text-right">
                        <StatusPill tone={i.status === "PAID" ? "ok" : i.status === "ISSUED" ? "warn" : "neutral"}>
                          {i.status === "PAID" ? "Betaald" : i.status === "ISSUED" ? "Open" : i.status}
                        </StatusPill>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <a
                          href={`/api/invoices/${i.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          PDF ↓
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
