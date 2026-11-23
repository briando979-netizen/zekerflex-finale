import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { EmptyState, StatusPill } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { Kaart } from "@/components/werkgever/Kaart";
import { listCounterOffers } from "@/lib/offers/store";
import { getDict, getLocale } from "@/lib/i18n/server";
import { amsterdamClock, amsterdamDagLabel, amsterdamDayKey } from "@/lib/time/amsterdam";
import { fmt } from "@/lib/i18n/dictionaries";
import { klusTab } from "@/lib/werkgever/klus-fase";

export const dynamic = "force-dynamic";

const TABS = ["open", "gepland", "historie"] as const;
type Tab = (typeof TABS)[number];
/** de kleur van de status in een rij: groen = bezet, amber = wacht nog op mensen, rood = geannuleerd */
const STATUS_TOON: Record<string, "ok" | "warn" | "crit" | "neutral"> = {
  FILLED: "ok",
  IN_PROGRESS: "ok",
  PARTIALLY_FILLED: "warn",
  OPEN: "warn",
  MATCHING: "warn",
  CANCELLED: "crit",
};

// Klussen van het bedrijf in tabbladen (20 nov 2026, naar YoungOnes): Openstaand · Klaar om uit te voeren · Uren controleren
// (de urenpagina) · Gearchiveerd, met een zoekveld op titel en locatie. Tab en zoekopdracht staan in de URL (?tab=&q=), dus
// de pagina blijft een servercomponent en een link naar een tab is deelbaar.
export default async function WerkgeverDienstenPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; q?: string | string[] }> }) {
  const dict = await getDict();
  const sh = dict.shifts;
  const statusNaam = dict.shiftStatus;
  // de dag van een klus in de taal van de app, altijd in Nederlandse tijd (lib/time/amsterdam.ts)
  const datumTaal = (await getLocale()) === "nl" ? "nl-NL" : "en-GB";
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
  // elke klus in precies één tabblad (lib/werkgever/klus-fase.ts): een voorbije volle klus stond eerst in twee
  const open = gefilterd.filter((s) => klusTab(s, now) === "open");
  const planned = gefilterd.filter((s) => klusTab(s, now) === "gepland");
  const historie = gefilterd.filter((s) => klusTab(s, now) === "historie");
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
          {/* de tabbladen: elk minstens 44 px hoog om te tikken */}
          <nav aria-label={sh.title} className="flex flex-wrap items-center gap-1 border-b border-hairstrong">
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
                className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold ${tab === t ? "border-brand-500 text-ink" : "border-transparent text-neutralx-500 hover:text-ink"}`}
              >
                {label}
                {n > 0 && <span className="num ml-1.5 rounded-full bg-paper-soft px-1.5 py-0.5 text-[11px] text-neutralx-600">{n}</span>}
              </Link>
            ))}
            <Link href="/werkgever/uren" className="-mb-px inline-flex min-h-11 items-center border-b-2 border-transparent px-4 text-sm font-semibold text-neutralx-500 hover:text-ink">
              {sh.tabHours}
              {urenTeKeuren > 0 && <span className="num ml-1.5 rounded-full bg-warn px-1.5 py-0.5 text-[11px] font-bold text-white">{urenTeKeuren}</span>}
            </Link>
          </nav>

          {/* één witte kaart (23 nov 2026, zoals de klussenlijst van YoungOnes): bovenin het zoekveld, daaronder de klussen als rijen.
              Een rij = de titel, daaronder dag, tijd en locatie; rechts de bezetting en de status. De hele rij is de link naar de klus. */}
          <Kaart vulling={false}>
            <form action="/werkgever/diensten" method="get" className="flex flex-wrap items-center gap-2 border-b border-hair p-5">
              <input type="hidden" name="tab" value={tab} />
              <label className="sr-only" htmlFor="klus-zoek">{sh.searchPh}</label>
              <input id="klus-zoek" name="q" defaultValue={q} placeholder={sh.searchPh} className="field-input !mt-0 min-w-0 flex-1 sm:max-w-sm" />
              <button type="submit" className="btn-ghost min-h-11 text-sm">{sh.searchBtn}</button>
              {q && (
                <Link href={tabHref(tab).replace(/&q=.*$/, "")} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-neutralx-500 hover:text-ink">
                  {sh.searchClear}
                </Link>
              )}
            </form>

            {lijst.length === 0 ? (
              <p className="px-5 py-6 text-sm text-neutralx-600">{q ? sh.noMatch : leeg}</p>
            ) : (
              <ul className="divide-y divide-hair">
                {lijst.map((s) => {
                  const biedingen = offerCountByShift.get(s.id) ?? 0;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/werkgever/diensten/${s.id}`}
                        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-5 transition-colors hover:bg-paper-soft"
                      >
                        <span className="min-w-0 flex-1 basis-64">
                          <span className="block break-words font-display text-base font-bold leading-snug text-ink">{s.title}</span>
                          <span className="mt-1 block text-sm leading-relaxed text-neutralx-500">
                            {amsterdamDagLabel(amsterdamDayKey(s.startsAt), datumTaal)} <span aria-hidden>|</span> {amsterdamClock(s.startsAt)} - {amsterdamClock(s.endsAt)}{" "}
                            <span aria-hidden>|</span> {s.branch.name}
                            {s.branch.city ? ` (${s.branch.city})` : ""}
                          </span>
                        </span>
                        <span className="flex flex-shrink-0 flex-col items-start gap-1.5 sm:items-end">
                          <span className="num text-sm font-bold text-ink">{fmt(sh.rijBezet, { filled: s._count.assignments, positions: s.positions })}</span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <StatusPill tone={STATUS_TOON[s.status] ?? "neutral"}>{(statusNaam as Record<string, string>)[s.status] ?? s.status}</StatusPill>
                            {biedingen > 0 && <span className="pill-warn">{fmt(sh.offerBadge, { n: biedingen })}</span>}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Kaart>
        </div>
      )}
    </>
  );
}
