import { prisma } from "@/lib/prisma";
import { listCounterOffers } from "@/lib/offers/store";

// ---------------------------------------------------------------------------
// Blok 2 van "Jouw start" ("Jouw eerste klus", 23 nov 2026): wat er echt gebeurd is, uit de gegevens zelf. De regels voor de stappen
// staan puur in lib/onboarding/voortgang.ts (werkgeverStappen); dit bestand levert alleen de feiten.
// ---------------------------------------------------------------------------

export interface EersteKlusFeiten {
  /** minstens één klus (niet geannuleerd) */
  heeftKlus: boolean;
  /** minstens één klus staat nu live voor werkers */
  klusLive: boolean;
  /** minstens één werker reageerde (een reactie of een zelf aangenomen klus) */
  heeftReactie: boolean;
  /** minstens één freelancer is ingepland */
  heeftIngepland: boolean;
}

export const GEEN_KLUS: EersteKlusFeiten = { heeftKlus: false, klusLive: false, heeftReactie: false, heeftIngepland: false };

const LIVE = ["OPEN", "MATCHING", "PARTIALLY_FILLED"];

export async function eersteKlusFeiten(tenantId: string, nu = new Date()): Promise<EersteKlusFeiten> {
  const klussen = await prisma.shift.findMany({
    where: { branch: { tenantId }, status: { not: "CANCELLED" } },
    select: {
      id: true,
      status: true,
      visibility: true,
      startsAt: true,
      _count: { select: { assignments: { where: { cancelledAt: null } }, matches: { where: { status: { in: ["VIEWED", "ACCEPTED"] } } } } },
    },
    take: 200,
  });
  if (klussen.length === 0) return GEEN_KLUS;
  const klusLive = klussen.some((k) => LIVE.includes(k.status) && k.visibility === "PUBLIC" && k.startsAt.getTime() >= nu.getTime());
  const heeftIngepland = klussen.some((k) => k._count.assignments > 0);
  let heeftReactie = heeftIngepland || klussen.some((k) => k._count.matches > 0);
  if (!heeftReactie) {
    // een reactie met een eigen tarief of opmerking staat niet als wedstrijd in de database maar bij de reacties (lib/offers/store.ts)
    const ids = new Set(klussen.map((k) => k.id));
    heeftReactie = (await listCounterOffers(500).catch(() => [])).some((o) => ids.has(o.shiftId) && o.status !== "withdrawn");
  }
  return { heeftKlus: true, klusLive, heeftReactie, heeftIngepland };
}
