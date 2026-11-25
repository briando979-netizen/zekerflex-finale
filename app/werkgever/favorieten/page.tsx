import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { responderCards } from "@/lib/replacements/responder-stats";
import { EmptyState } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";
import { SamenTabs } from "@/components/werkgever/SamenTabs";
import { samenTitel } from "@/lib/werkgever/samen-titel";
import { naamVoorMatch } from "@/lib/werkgever/naam";
import { werkerNamenVoor } from "@/lib/employer/match";
import { WerkerLijstMetZoeken } from "@/components/werkgever/WerkerLijstMetZoeken";

export const dynamic = "force-dynamic";

export default async function FavorietenPage() {
  const t = await getDict();
  const f = t.favorites;
  // met de vlag heet de ingang in het menu "Mijn werkers" (Favorieten is dan een tabblad eronder): de titel zegt hetzelfde
  const titel = await samenTitel("werkers", f.title);
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const rel = tenantId ? await getEmployerRelations(tenantId) : { favorites: [], blocked: [] };

  const noteByUser = new Map(rel.favorites.map((f) => [f.userId, f.note]));
  const favUserIds = rel.favorites.map((f) => f.userId);
  const [cards, namenMap] = await Promise.all([
    responderCards(favUserIds),
    tenantId ? werkerNamenVoor([tenantId], favUserIds) : Promise.resolve(new Map<string, string>()),
  ]);
  // keep the order the employer favourited them
  const order = new Map(rel.favorites.map((f, i) => [f.userId, i]));
  cards.sort((a, b) => (order.get(a.userId) ?? 0) - (order.get(b.userId) ?? 0));

  return (
    <>
      <PaginaKop
        title={titel}
        eyebrow={f.eyebrow}
        subtitle={f.subtitle}
        action={
          <div className="flex items-center gap-2">
            <Link href="/werkgever/favorieten/pools" className="btn-ghost">
              {t.pools.manage}
            </Link>
            <Link href="/werkgever/diensten/nieuw" className="btn-primary">
              {f.placeShift}
            </Link>
          </div>
        }
      />
      <SamenTabs groep="werkers" actief="favorieten" />

      {cards.length === 0 ? (
        <EmptyState title={f.emptyTitle} body={f.emptyBody} />
      ) : (
        <WerkerLijstMetZoeken
          werkers={cards.map((c) => {
            const note = noteByUser.get(c.userId);
            return {
            userId: c.userId,
            naam: namenMap.get(c.userId) ?? naamVoorMatch(c.name),
            badge: c.badgeLevel,
            ratingLine: c.avgRating > 0 ? fmt(f.ratingLine, { avg: c.avgRating.toFixed(1), n: c.reviewCount }) : f.noReviews,
            shiftsCompleted: c.shiftsCompleted,
            attendancePct: c.attendancePct,
            cancellations: c.cancellations,
            ...(note !== undefined ? { note } : {}),
            };
          })}
          t={{
            zoekPlaceholder: f.zoekPlaceholder,
            statShifts: f.statShifts,
            statAttendance: f.statAttendance,
            statCancellations: f.statCancellations,
            inviteForShift: f.inviteForShift,
            emptySearch: f.emptySearch,
          }}
        />
      )}
    </>
  );
}
