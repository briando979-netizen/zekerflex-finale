import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { listCounterOffers } from "@/lib/offers/store";
import { PageHeader, EmptyState, Panel, money } from "@/components/app/ui";
import { amsterdamClock } from "@/lib/time/amsterdam";

// Nederlandse datum in Amsterdamse tijd (de server rekent in UTC)
const dag = (iso: Date | string) =>
  new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });

export const dynamic = "force-dynamic";

// Werkgever → Reacties: alle openstaande reacties van flexwerkers op uw klussen
// op één plek, per klus gegroepeerd. Beslissen (aannemen, tegenbod) gebeurt op
// de klus zelf, met dezelfde knoppen als altijd.
export default async function WerkgeverReactiesPage() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const branchFilter = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };

  // eerst de openstaande reacties, dan alleen die klussen van dit bedrijf (zo valt geen nieuwe klus weg)
  const openstaand = (await listCounterOffers(1000)).filter((o) => o.status === "pending");
  const shifts = await prisma.shift.findMany({
    where: { id: { in: [...new Set(openstaand.map((o) => o.shiftId))] }, branch: branchFilter },
    select: { id: true, title: true, startsAt: true, branch: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });
  const shiftIds = new Set(shifts.map((s) => s.id));
  const offers = openstaand.filter((o) => shiftIds.has(o.shiftId));

  // per klus: de reacties, de oudste eerst
  const perKlus = new Map<string, typeof offers>();
  for (const o of offers) {
    const lijst = perKlus.get(o.shiftId) ?? [];
    lijst.push(o);
    perKlus.set(o.shiftId, lijst);
  }
  const groepen = shifts
    .filter((s) => perKlus.has(s.id))
    .map((s) => ({ shift: s, reacties: (perKlus.get(s.id) ?? []).sort((a, b) => (a.at < b.at ? -1 : 1)) }))
    .sort((a, b) => b.reacties.length - a.reacties.length);

  return (
    <>
      <PageHeader
        title="Reacties op je klussen"
        subtitle="Alle flexwerkers die gereageerd hebben en nog wachten op jouw keuze, per klus. Kies aannemen of een tegenbod op de klus zelf."
        action={
          <Link href="/werkgever/diensten" className="btn-ghost">
            ← Terug naar klussen
          </Link>
        }
      />

      {groepen.length === 0 ? (
        <EmptyState title="Geen openstaande reacties" body="Zodra een flexwerker op een van je klussen reageert, zie je die hier." />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-neutralx-600">
            <strong className="text-ink">{offers.length}</strong> {offers.length === 1 ? "reactie" : "reacties"} op {groepen.length} {groepen.length === 1 ? "klus" : "klussen"}.
          </p>
          {groepen.map(({ shift, reacties }) => (
            <Panel
              key={shift.id}
              title={`${shift.title}`}
              subtitle={`${shift.branch.name} · ${dag(shift.startsAt)} ${amsterdamClock(shift.startsAt)}`}
              action={
                <Link href={`/werkgever/diensten/${shift.id}`} className="btn-primary text-sm">
                  Beslissen op de klus
                </Link>
              }
            >
              <ul className="divide-y divide-hair">
                {reacties.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{o.freelancerName}</p>
                      <p className="text-xs text-neutralx-500">
                        Gereageerd op {dag(o.at)} om {amsterdamClock(o.at)}
                        {o.note ? ` · “${o.note}”` : ""}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-neutralx-500">Vraagprijs {money(o.listedRateCents)}/u</p>
                      <p className="font-semibold text-ink">Voorstel {money(o.proposedRateCents)}/u</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
