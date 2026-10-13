import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { listPools } from "@/lib/pools/store";
import { getUserAvatars } from "@/lib/profile/store";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { PoolsManager } from "@/components/app/PoolsManager";

export const dynamic = "force-dynamic";

export default async function FavoritePoolsPage() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  const [rel, pools] = tenantId
    ? await Promise.all([getEmployerRelations(tenantId), listPools(tenantId)])
    : [{ favorites: [], blocked: [] }, []];

  const avatars = await getUserAvatars([
    ...rel.favorites.map((f) => f.userId),
    ...pools.flatMap((p) => p.members.map((m) => m.freelancerUserId)),
  ]);

  return (
    <>
      <div className="mb-6">
        <Link href="/werkgever/favorieten" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← Favorieten
        </Link>
      </div>

      <PageHeader
        title="Favoriete pools"
        subtitle="Groepeer favoriete krachten in pools die je privé kunt uitnodigen voor een nieuwe dienst, vóórdat die op de open markt komt."
      />

      {rel.favorites.length === 0 ? (
        <EmptyState
          title="Nog geen favorieten"
          body="Markeer eerst een kracht als favoriet (hartje) voordat je pools kunt maken."
        />
      ) : (
        <PoolsManager
          favorites={rel.favorites.map((f) => ({ userId: f.userId, name: f.name }))}
          pools={pools.map((p) => ({
            id: p.id,
            name: p.name,
            members: p.members.map((m) => ({ userId: m.freelancerUserId })),
          }))}
          avatars={avatars}
        />
      )}
    </>
  );
}
