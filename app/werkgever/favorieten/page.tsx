import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getEmployerRelations } from "@/lib/employer/relations";
import { responderCards } from "@/lib/replacements/responder-stats";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { FreelancerRelationButton } from "@/components/app/FreelancerRelationButton";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

export default async function FavorietenPage() {
  const t = getDict();
  const f = t.favorites;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const rel = tenantId ? await getEmployerRelations(tenantId) : { favorites: [], blocked: [] };

  const noteByUser = new Map(rel.favorites.map((f) => [f.userId, f.note]));
  const cards = await responderCards(rel.favorites.map((f) => f.userId));
  // keep the order the employer favourited them
  const order = new Map(rel.favorites.map((f, i) => [f.userId, i]));
  cards.sort((a, b) => (order.get(a.userId) ?? 0) - (order.get(b.userId) ?? 0));

  return (
    <>
      <PageHeader
        title={f.title}
        eyebrow={f.eyebrow}
        subtitle={f.subtitle}
        action={
          <Link href="/werkgever/diensten/nieuw" className="btn-primary">
            {f.placeShift}
          </Link>
        }
      />

      {cards.length === 0 ? (
        <EmptyState title={f.emptyTitle} body={f.emptyBody} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const note = noteByUser.get(c.userId);
            return (
              <li key={c.userId} className="surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-base font-bold text-ink">{c.name}</p>
                    <p className="mt-0.5 text-xs text-neutralx-400">
                      {BADGE[c.badgeLevel] ?? c.badgeLevel}
                      {c.avgRating > 0
                        ? ` · ${fmt(f.ratingLine, { avg: c.avgRating.toFixed(1), n: c.reviewCount })}`
                        : ` · ${f.noReviews}`}
                    </p>
                  </div>
                  <FreelancerRelationButton userId={c.userId} name={c.name} kind="favorite" active />
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label={f.statShifts} value={String(c.shiftsCompleted)} />
                  <Stat label={f.statAttendance} value={`${c.attendancePct}%`} />
                  <Stat label={f.statCancellations} value={String(c.cancellations)} />
                </dl>

                {note && <p className="mt-3 text-xs italic text-neutralx-500">“{note}”</p>}

                <div className="mt-3 flex items-center gap-2 border-t border-hair pt-3">
                  <Link href="/werkgever/diensten/nieuw" className="btn-ghost px-3 py-1.5 text-xs">
                    {f.inviteForShift}
                  </Link>
                  <FreelancerRelationButton userId={c.userId} name={c.name} kind="block" active={false} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hair bg-white px-2 py-2">
      <p className="num font-display text-lg font-bold text-ink">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-neutralx-400">{label}</p>
    </div>
  );
}
