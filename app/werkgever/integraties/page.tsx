import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { resolveTenantPlan } from "@/lib/api-plans/resolve";
import { API_PLANS } from "@/lib/api-plans/catalog";
import { PageHeader, Panel } from "@/components/app/ui";
import { PlanPicker } from "@/components/app/PlanPicker";
import { WerkgeverApiKeysBoard } from "@/components/app/WerkgeverApiKeysBoard";

export const dynamic = "force-dynamic";

export default async function IntegratiesPage() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0] ?? null;
  const plan = tenantId ? await resolveTenantPlan(tenantId) : API_PLANS.free;

  return (
    <>
      <PageHeader
        title="API & integraties"
        subtitle="Koppel je eigen systemen aan ZekerFlex: open diensten lezen, diensten aanmaken, goedgekeurde uren ophalen en webhooks ontvangen."
      />

      <div className="mb-8">
        <Panel title="Abonnement">
          <PlanPicker currentPlanKey={plan.key} hasOrganization={Boolean(tenantId)} />
        </Panel>
      </div>

      <Panel
        title="API-sleutels"
        subtitle="Zelf aanmaken en intrekken. Scopes zijn beperkt tot wat je huidige abonnement toestaat."
      >
        <WerkgeverApiKeysBoard allowedScopes={plan.scopes} />
      </Panel>

      <p className="mt-6 text-xs text-neutralx-500">
        Volledige documentatie, voorbeeldverzoeken en de OpenAPI-spec:{" "}
        <Link href="/developers" className="font-medium text-brand-700 hover:underline">
          /developers
        </Link>
        .
      </p>
    </>
  );
}
