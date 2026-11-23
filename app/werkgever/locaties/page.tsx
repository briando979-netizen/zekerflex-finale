import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { Panel } from "@/components/app/ui";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { BranchesBoard } from "@/components/app/BranchesBoard";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LocatiesPage() {
  const l = (await getDict()).locaties;
  const principal = await requirePrincipal();
  await resolveEmployerScope(principal);
  const canManage = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");

  return (
    <>
      <InstellingenKop title={l.title} subtitle={l.subtitle} />

      <Panel title={l.panelTitle} subtitle={canManage ? l.panelManage : l.panelNoManage}>
        <div className="p-5">
          <BranchesBoard canManage={canManage} />
        </div>
      </Panel>

      <p className="mt-6 text-xs text-neutralx-500">{l.oneOff}</p>
    </>
  );
}
