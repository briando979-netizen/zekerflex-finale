import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { EmptyState } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { EmployerShiftCard } from "@/components/app/EmployerShiftCard";
import { listCounterOffers } from "@/lib/offers/store";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

const OPEN = ["OPEN", "MATCHING", "PARTIALLY_FILLED"];
const TABS = ["open", "gepland", "historie"] as const;
type Tab = (typeof TABS)[number];

// Klussen van het bedrijf in tabbladen (20 nov 2026, naar YoungOnes): Openstaand · Klaar om uit te voeren · Uren controleren
// (de urenpagina) · Gearchiveerd, met een zoekveld op titel en locatie. Tab en zoekopdracht staan in de URL (?tab=&q=), dus
// de pagina blijft een servercomponent en een link naar een tab is deelbaar.
export default async function WerkgeverDienstenPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; q?: string | string[] }> }) {
  const sh = (await getDict()).shifts;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const branchFilter = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
  const sp = await searchParams;
  const tabRuw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = (TABS as readonly string[]).includes(tabRuw ?? "") ? (tabRuw as Tab) : "open";
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 80) ?? "";

  const [shifts, offers, urenTeKeuren] = await Promise.all([
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
        branch: { select: { name: true, city: true } },
        _count: { select: { assignments: { where: { cancelledAt: null } }, matches: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 90,
    }),
    listCounterOffers(500),
    // ingediende uren die op goedkeuring wachten: het tabblad "Uren controleren" linkt naar de urenpagina
    prisma.timesheet.count({ where: { status: "SUBMITTED", branch: branchFilter } }).catch(() => 0),
  ]);

  const offerCountByShift = new Map<string, number>();
  for (const o of offers) if (o.status === "pending") offerCountByShift.set(o.shiftId, (offerCountByShift.get(o.shiftId) ?? 0) + 1);
  // alleen reacties op de eigen klussen tellen (listCounterOffers geeft die van het hele platform)
  const pendingReacties = shifts.reduce((n, s) => n + (offerCountByShift.get(s.id) ?? 0), 0);

  const now = Date.now();
  const zoek = q.toLowerCase();
  const past = (s: (typeof shifts)[number]) => !zoek || s.title.toLowerCase().includes(zoek) || s.branch.name.toLowerCase().includes(zoek) || s.branch.city.toLowerCase().includes(zoek);
  const gefilterd = shifts.filter(past);
  const open = gefilterd.filter((s) => OPEN.includes(s.status) && s.startsAt.getTime() >= now);
  const planned = gefilterd.filter((s) => s.status === "FILLED" || (s.startsAt.getTime() >= now && !OPEN.includes(s.status)));
  const historie = gefilterd.filter((s) => s.startsAt.getTime() < now);
  const lijst = tab === "open" ? open : tab === "gepland" ? planned : historie;
  const leeg = tab === "open" ? sh.tabEmptyOpen : tab === "gepland" ? sh.tabEmptyPlanned : sh.tabEmptyHistory;
  const tabHref = (t: Tab) => `/werkgever/diensten?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PaginaKop
        title={sh.title}
        subtitle={sh.subtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/werkgever/reacties" className="btn-ghost">
              {sh.reactions}{pendingReacties > 0 ? ` (${pendingReacties})` : ""}
            </Link>
            <Link href="/werkgever/diensten/nieuw" className="btn-primary">
              {sh.placeShift}
            </Link>
          </div>
        }
      />

      {shifts.length === 0 ? (
        <EmptyState
          title={sh.emptyTitle}
          body={sh.emptyBody}
          cta={{ href: "/werkgever/diensten/nieuw", label: sh.placeShift }}
        />
      ) : (
        <div className="space-y-6">
          <nav aria-label={sh.title} className="flex flex-wrap items-center gap-1 border-b border-hair">
            {(
              [
                ["open", sh.tabOpen, open.length],
                ["gepland", sh.tabPlanned, planned.length],
                ["historie", sh.tabHistory, historie.length],
              ] as const
            ).map(([t, label, n]) => (
              <Link
                key={t}
                href={tabHref(t)}
                aria-current={tab === t ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === t ? "border-ink text-ink" : "border-transparent text-neutralx-500 hover:text-ink"}`}
              >
                {label}
                {n > 0 && <span className="num ml-1.5 rounded-full bg-paper-soft px-1.5 py-0.5 text-[11px] text-neutralx-600">{n}</span>}
              </Link>
            ))}
            <Link href="/werkgever/uren" className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-neutralx-500 hover:text-ink">
              {sh.tabHours}
              {urenTeKeuren > 0 && <span className="num ml-1.5 rounded-full bg-warn px-1.5 py-0.5 text-[11px] font-bold text-white">{urenTeKeuren}</span>}
            </Link>
          </nav>

          <form action="/werkgever/diensten" method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="tab" value={tab} />
            <label className="sr-only" htmlFor="klus-zoek">{sh.searchPh}</label>
            <input id="klus-zoek" name="q" defaultValue={q} placeholder={sh.searchPh} className="field-input max-w-sm" />
            <button type="submit" className="btn-ghost text-sm">{sh.searchBtn}</button>
            {q && (
              <Link href={tabHref(tab).replace(/&q=.*$/, "")} className="text-sm font-medium text-neutralx-500 hover:text-ink">
                {sh.searchClear}
              </Link>
            )}
          </form>

          {lijst.length === 0 ? (
            <p className="rounded-2xl bg-paper-soft p-6 text-sm text-neutralx-600">{q ? sh.noMatch : leeg}</p>
          ) : (
            <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${tab === "historie" ? "opacity-75" : ""}`}>
              {lijst.map((s) => (
                <div key={s.id} className="relative">
                  {(offerCountByShift.get(s.id) ?? 0) > 0 && (
                    <span className="absolute -right-2 -top-2 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-warn px-1.5 text-[11px] font-bold text-white shadow">
                      {fmt(sh.offerBadge, { n: offerCountByShift.get(s.id) ?? 0 })}
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
          )}
        </div>
      )}
    </>
  );
}
