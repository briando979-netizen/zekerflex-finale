import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { PageHeader, Panel } from "@/components/app/ui";
import { BranchesBoard } from "@/components/app/BranchesBoard";

export const dynamic = "force-dynamic";

export default async function LocatiesPage() {
  const principal = await requirePrincipal();
  await resolveEmployerScope(principal);
  const canManage = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");

  return (
    <>
      <PageHeader
        title="Locaties"
        subtitle="Beheer de vestigingen van je organisatie. Elke vestiging heeft een geverifieerd adres (uit het PDOK-adresregister) en een eigen geofence voor het inchecken van personeel."
      />

      <Panel
        title="Vestigingen"
        subtitle={
          canManage
            ? "Voeg een vestiging toe, of bewerk een bestaande."
            : "Alleen een beheerder (HQ_ADMIN) van je organisatie kan vestigingen toevoegen of verwijderen."
        }
      >
        <div className="p-5">
          <BranchesBoard canManage={canManage} />
        </div>
      </Panel>

      <p className="mt-6 text-xs text-neutralx-500">
        Voor een klus op een eenmalige locatie (bijv. een demo op afstand) hoef je geen vaste
        vestiging aan te maken — kies bij het plaatsen van de klus &quot;Eenmalige locatie&quot;.
      </p>
    </>
  );
}
