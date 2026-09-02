import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { EmployerShiftCard } from "@/components/app/EmployerShiftCard";
import { listCounterOffers } from "@/lib/offers/store";

export const dynamic = "force-dynamic";

const OPEN = ["OPEN", "MATCHING", "PARTIALLY_FILLED"];

export default async function WerkgeverDienstenPage() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const branchFilter = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };

  const [shifts, offers] = await Promise.all([
    prisma.shift.findMany({
      where: { branch: branchFilter },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        positions: true,
        status: true,
        requiredSkill: { select: { name: true } },
        branch: { select: { name: true } },
        _count: { select: { assignments: { where: { cancelledAt: null } }, matches: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 90,
    }),
    listCounterOffers(500),
  ]);

  const offerCountByShift = new Map<string, number>();
  for (const o of offers) if (o.status === "pending") offerCountByShift.set(o.shiftId, (offerCountByShift.get(o.shiftId) ?? 0) + 1);

  const now = Date.now();
  const open = shifts.filter((s) => OPEN.includes(s.status) && s.startsAt.getTime() >= now);
  const planned = shifts.filter((s) => s.status === "FILLED" || (s.startsAt.getTime() >= now && !OPEN.includes(s.status)));
  const past = shifts.filter((s) => s.startsAt.getTime() < now);

  return (
    <>
      <PageHeader
        title="Diensten"
        eyebrow="Bezetting"
        subtitle="Uitgezette diensten en hun bezetting. Klik door voor kandidaten en tegenbiedingen."
        action={
          <Link href="/werkgever/diensten/nieuw" className="btn-primary">
            Dienst uitzetten
          </Link>
        }
      />

      {shifts.length === 0 ? (
        <EmptyState
          title="Nog geen diensten"
          body="Zet je eerste dienst uit. ZekerFlex rangschikt direct de beste kandidaten op reistijd en betrouwbaarheid."
          cta={{ href: "/werkgever/diensten/nieuw", label: "Dienst uitzetten" }}
        />
      ) : (
        <div className="space-y-10">
          <Group title="Werven" note="Deze diensten zijn nog niet vol." shifts={open} offerCounts={offerCountByShift} />
          <Group title="Gepland & bezet" note="Bevestigde diensten die nog moeten plaatsvinden." shifts={planned} offerCounts={offerCountByShift} />
          <Group title="Historie" note="Afgeronde en verlopen diensten." shifts={past} offerCounts={offerCountByShift} dim />
        </div>
      )}
    </>
  );
}

function Group({
  title,
  note,
  shifts,
  offerCounts,
  dim = false,
}: {
  title: string;
  note: string;
  shifts: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    positions: number;
    status: string;
    requiredSkill: { name: string } | null;
    branch: { name: string };
    _count: { assignments: number; matches: number };
  }[];
  offerCounts: Map<string, number>;
  dim?: boolean;
}) {
  if (shifts.length === 0) return null;
  return (
    <section>
      <h2 className="font-display text-lg font-bold text-ink">
        {title} <span className="text-sm font-normal text-neutralx-400">· {shifts.length}</span>
      </h2>
      <p className="mb-4 mt-1 text-sm text-neutralx-500">{note}</p>
      <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${dim ? "opacity-75" : ""}`}>
        {shifts.map((s) => (
          <div key={s.id} className="relative">
            {(offerCounts.get(s.id) ?? 0) > 0 && (
              <span className="absolute -right-2 -top-2 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-warn px-1.5 text-[11px] font-bold text-white shadow">
                {offerCounts.get(s.id)} bod
              </span>
            )}
            <EmployerShiftCard
              href={`/werkgever/diensten/${s.id}`}
              shift={{
                id: s.id,
                title: s.title,
                branch: s.branch.name,
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                positions: s.positions,
                filled: s._count.assignments,
                status: s.status,
                skill: s.requiredSkill?.name ?? null,
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
