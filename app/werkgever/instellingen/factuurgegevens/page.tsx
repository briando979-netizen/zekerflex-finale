import type { Metadata } from "next";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { getDict } from "@/lib/i18n/server";
import { peppolIngesteld } from "@/lib/efactuur/instellingen";
import { Panel } from "@/components/app/ui";
import { BillingPrefsForm } from "@/components/app/BillingPrefsForm";
import { EfactuurSettings } from "@/components/werkgever/EfactuurSettings";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Factuurgegevens" };

// Instellingen → Factuurgegevens (25 nov 2026): een eigen pagina voor het factuuradres,
// kostenplaatsen en e-factuur. Was een inklapblok onderaan de Facturen-pagina (#factuurgegevens).
export default async function FactuurgegevensPage() {
  const principal = await requirePrincipal();
  const d = await getDict();
  const iv = d.invoices;
  const s = d.settings;
  const scope = await resolveEmployerScope(principal);
  const billing = scope.tenantIds[0] ? await getOrgProfileExtra(scope.tenantIds[0]) : {};

  return (
    <>
      <InstellingenKop title={s.cInvoiceT} />
      <p className="mb-6 text-sm leading-relaxed text-neutralx-600">{s.cInvoiceS}</p>

      <Panel title={iv.detailsPanel}>
        <BillingPrefsForm
          initial={{
            billingEmail: billing.billingEmail ?? "",
            splitByCostCentre: billing.splitByCostCentre ?? false,
            costCentres: billing.costCentres ?? [],
          }}
        />
      </Panel>

      <div className="mt-4" id="e-factuur">
        <Panel title={peppolIngesteld() ? iv.efactuurPanelPeppol : iv.efactuurPanel}>
          <EfactuurSettings />
        </Panel>
      </div>
    </>
  );
}
