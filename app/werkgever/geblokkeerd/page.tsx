import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { EmptyState, dateShort } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { FreelancerRelationButton } from "@/components/app/FreelancerRelationButton";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";
import { SamenTabs } from "@/components/werkgever/SamenTabs";
import { werkerNamenVoor } from "@/lib/employer/match";
import { naamVoorMatch } from "@/lib/werkgever/naam";

export const dynamic = "force-dynamic";

export default async function GeblokkeerdPage() {
  const b = (await getDict()).blocked;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const rel = tenantId ? await getEmployerRelations(tenantId) : { favorites: [], blocked: [] };
  const blockedIds = rel.blocked.map((x) => x.userId);
  const namenMap = tenantId && blockedIds.length > 0
    ? await werkerNamenVoor([tenantId], blockedIds)
    : new Map<string, string>();

  return (
    <>
      <PaginaKop title={b.title} eyebrow={b.eyebrow} subtitle={b.subtitle} />
      <SamenTabs groep="werkers" actief="geblokkeerd" />

      {rel.blocked.length === 0 ? (
        <EmptyState title={b.emptyTitle} body={b.emptyBody} />
      ) : (
        <ul className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-white">
          {rel.blocked.map((x) => (
            <li key={x.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{namenMap.get(x.userId) ?? naamVoorMatch(x.name)}</p>
                <p className="text-xs text-neutralx-500">
                  {fmt(b.blockedSince, { date: dateShort(x.at) })}
                  {x.note ? ` · ${x.note}` : ""}
                </p>
              </div>
              <FreelancerRelationButton userId={x.userId} name={x.name} kind="block" active />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
