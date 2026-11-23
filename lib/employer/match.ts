import { prisma } from "@/lib/prisma";
import { naamVoorBedrijf, type Inplanning } from "@/lib/employer/match-kern";

// ---------------------------------------------------------------------------
// De gegevens bij "de match" (lib/employer/match-kern.ts): de inplanningen van een werker bij een bedrijf, en de namen van
// een groep werkers zoals dat bedrijf ze mag zien (favorieten, geblokkeerd, groepen, chat). De naam wordt bij het tonen
// opgezocht, niet bewaard: wordt iemand later ingepland, dan staat zijn volledige naam er vanzelf.
// ---------------------------------------------------------------------------

/** De inplanningen van deze werker bij dit bedrijf, voor naamBekend en contactZichtbaar. */
export async function inplanningenBij(tenantId: string, freelancerId: string): Promise<Inplanning[]> {
  return prisma.shiftAssignment.findMany({
    where: { freelancerId, shift: { branch: { tenantId } } },
    select: { cancelledAt: true, shift: { select: { status: true, endsAt: true } } },
    orderBy: { acceptedAt: "desc" },
    take: 200,
  });
}

/** Welke van deze werkers zijn ooit (niet geannuleerd) bij een van deze bedrijven ingepland? */
export async function ingeplandBij(tenantIds: readonly string[], userIds: readonly string[]): Promise<Set<string>> {
  const uit = new Set<string>();
  if (tenantIds.length === 0 || userIds.length === 0) return uit;
  const rijen = await prisma.shiftAssignment.findMany({
    where: {
      cancelledAt: null,
      freelancer: { userId: { in: [...userIds] } },
      shift: { status: { not: "CANCELLED" }, branch: { tenantId: { in: [...tenantIds] } } },
    },
    select: { freelancer: { select: { userId: true } } },
    distinct: ["freelancerId"],
  });
  for (const r of rijen) uit.add(r.freelancer.userId);
  return uit;
}

/**
 * De namen van deze werkers zoals het bedrijf ze mag zien: volledig na een inplanning, anders voornaam en eerste letter.
 * Een werker die niet meer bestaat staat niet in de uitkomst.
 */
export async function werkerNamenVoor(tenantIds: readonly string[], userIds: readonly string[]): Promise<Map<string, string>> {
  const uit = new Map<string, string>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return uit;
  const [users, bekend] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }),
    ingeplandBij(tenantIds, ids),
  ]);
  for (const u of users) uit.set(u.id, naamVoorBedrijf(u.fullName, bekend.has(u.id)));
  return uit;
}
