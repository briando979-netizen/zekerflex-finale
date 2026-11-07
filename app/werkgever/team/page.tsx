import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { PageHeader, Panel, EmptyState } from "@/components/app/ui";
import { TeamPanel } from "@/components/werkgever/TeamPanel";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function WerkgeverTeamPage() {
  const c = (await getDict()).team;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  if (!tenantId) {
    return (
      <>
        <PageHeader title={c.title} />
        <EmptyState title={c.noOrgTitle} body={c.noOrgBody} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={c.title} subtitle={c.subtitle} />
      <Panel title={c.panel}>
        <TeamPanel tenantId={tenantId} />
      </Panel>
    </>
  );
}
