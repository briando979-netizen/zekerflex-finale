import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { PageHeader, EmptyState, dateShort } from "@/components/app/ui";
import { FreelancerRelationButton } from "@/components/app/FreelancerRelationButton";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function GeblokkeerdPage() {
  const b = getDict().blocked;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const rel = tenantId ? await getEmployerRelations(tenantId) : { favorites: [], blocked: [] };

  return (
    <>
      <PageHeader title={b.title} eyebrow={b.eyebrow} subtitle={b.subtitle} />

      {rel.blocked.length === 0 ? (
        <EmptyState title={b.emptyTitle} body={b.emptyBody} />
      ) : (
        <ul className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-white">
          {rel.blocked.map((x) => (
            <li key={x.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{x.name}</p>
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
