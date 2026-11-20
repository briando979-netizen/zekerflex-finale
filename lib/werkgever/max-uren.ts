import { prisma } from "@/lib/prisma";
import { dienstUren } from "@/lib/werkgever/max-uren-kern";

// ---------------------------------------------------------------------------
// Maximum uren per werker bij één bedrijf (20 nov 2026, naar YoungOnes "Maximum uren per worker" en Temper's 660-uurgrens):
// het bedrijf stelt in hoeveel uur een werker in 12 maanden voor hem mag werken; gewerkte én ingeplande uren tellen.
// Boven het maximum kan de werker niet meer reageren (lib/matching/apply.ts); zakt het eronder, dan weer wel.
// De grens staat in OrgProfileExtra.maxUrenPerWerker (lib/profile/store.ts); 0 of leeg = geen grens.
// Het pure deel (rekenen) staat in max-uren-kern.ts.
// ---------------------------------------------------------------------------

export { MAX_UREN_HOOGSTE, dienstUren, pastBinnenMaxUren } from "@/lib/werkgever/max-uren-kern";

/** Gewerkte en ingeplande uren van deze werker bij dit bedrijf in de laatste 12 maanden (en de toekomst). */
export async function urenBijBedrijf(tenantId: string, freelancerId: string, now = new Date()): Promise<number> {
  const sinds = new Date(now.getTime() - 365 * 86_400_000);
  const rijen = await prisma.shiftAssignment.findMany({
    where: { freelancerId, cancelledAt: null, shift: { startsAt: { gte: sinds }, status: { not: "CANCELLED" }, branch: { tenantId } } },
    select: { shift: { select: { startsAt: true, endsAt: true, breakMinutes: true } } },
  });
  return rijen.reduce((som, r) => som + dienstUren(r.shift), 0);
}
