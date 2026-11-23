import { hasRole, requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getDict } from "@/lib/i18n/server";
import { lijstKostenplaatsen } from "@/lib/werkgever/kostenplaatsen";
import { KOSTENPLAATS_MAX } from "@/lib/werkgever/kostenplaatsen-kern";
import { EmptyState } from "@/components/app/ui";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { KostenplaatsBeheer } from "@/components/werkgever/KostenplaatsBeheer";

export const dynamic = "force-dynamic";

// Instellingen → Kostenplaatsen (23 nov 2026, naar YoungOnes): de kostenplaatsen of PO-nummers waaruit je bij het uitzetten van een klus
// kiest. Eerst stonden ze in een inklapblok op Facturen; dat blok werkt nog, met een link naar deze pagina. De opslag is dezelfde
// (OrgProfileExtra.costCentres). Wijzigen mag een beheerder (HQ_ADMIN), lezen elke beheerder of vestigingsmanager.
export default async function KostenplaatsenPage() {
  const principal = await requirePrincipal();
  const d = await getDict();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  if (!tenantId) {
    return (
      <>
        <InstellingenKop title={d.kostenplaatsPagina.titel} />
        <EmptyState title={d.company.noOrgTitle} body={d.company.noOrgBody} />
      </>
    );
  }

  const rijen = await lijstKostenplaatsen(tenantId);
  return <KostenplaatsBeheer initieel={rijen} kanBeheren={hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")} max={KOSTENPLAATS_MAX} />;
}
