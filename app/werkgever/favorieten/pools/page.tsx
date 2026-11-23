import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { listPools } from "@/lib/pools/store";
import { getUserAvatars } from "@/lib/profile/store";
import { EmptyState } from "@/components/app/ui";
import { PoolsManager } from "@/components/app/PoolsManager";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
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
      {/* de kaart "Labels voor favorieten" op Instellingen opent deze pagina; Mijn werkers heeft er ook een knop naartoe */}
      <InstellingenKop title={t.pools.title} subtitle={t.pools.subtitle} />

      {rel.favorites.length === 0 ? (
        <EmptyState title={t.favorites.emptyTitle} body={t.pools.emptyBody} />
      ) : (
        <PoolsManager
          favorites={rel.favorites.map((f) => ({ userId: f.userId, name: f.name }))}
          pools={pools.map((p) => ({
            id: p.id,
            name: p.name,
            autoAccept: p.autoAccept,
            members: p.members.map((m) => ({ userId: m.freelancerUserId })),
          }))}
          avatars={avatars}
        />
      )}
    </>
  );
}
