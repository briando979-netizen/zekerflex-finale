import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { PageHeader, Panel } from "@/components/app/ui";
import { TeamBoard } from "@/components/app/TeamBoard";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const principal = await requirePrincipal();
  await resolveEmployerScope(principal);
  const canManage = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Beheer wie er namens je organisatie bij ZekerFlex kan — als beheerder, lokale manager van specifieke vestigingen, of geschillenbeheerder."
      />

      <Panel
        title="Teamleden"
        subtitle={
          canManage
            ? "Nodig collega's uit en beheer hun rol en vestigingen."
            : "Alleen een beheerder (HQ_ADMIN) kan teamleden uitnodigen of verwijderen."
        }
      >
        <div className="p-5">
          <TeamBoard canManage={canManage} />
        </div>
      </Panel>
    </>
  );
}
