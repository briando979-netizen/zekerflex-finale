import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { listPools } from "@/lib/pools/store";
import { getUserAvatars } from "@/lib/profile/store";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { PoolsManager } from "@/components/app/PoolsManager";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FavoritePoolsPage() {
  const t = await getDict();
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
          ← {t.favorites.title}
        </Link>
      </div>

      <PageHeader title={t.pools.title} subtitle={t.pools.subtitle} />

      {rel.favorites.length === 0 ? (
        <EmptyState title={t.favorites.emptyTitle} body={t.pools.emptyBody} />
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
