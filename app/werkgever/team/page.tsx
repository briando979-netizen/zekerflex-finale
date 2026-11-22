import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { PageHeader, Panel } from "@/components/app/ui";
import { TeamBoard } from "@/components/app/TeamBoard";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const k = (await getDict()).teamPagina;
  const principal = await requirePrincipal();
  await resolveEmployerScope(principal);
  const canManage = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");

  return (
    <>
      <PageHeader
        title={k.titel}
        subtitle={k.subtitel}
      />

      <Panel
        title={k.paneel}
        subtitle={canManage ? k.subBeheer : k.subGeenBeheer}
      >
        <div className="p-5">
          <TeamBoard canManage={canManage} />
        </div>
      </Panel>
    </>
  );
}
