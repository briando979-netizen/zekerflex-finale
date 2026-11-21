import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isTestklus } from "@/lib/shifts/testklus";
import { isEigenTestKlus } from "@/lib/admin/eigen-test-kern";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { workerMissWhere, workerMissed } from "@/lib/profile/card";
import { proefklussenOver } from "@/lib/fiscal/proefklussen-kern";

// De telling bij lib/fiscal/proefklussen-kern.ts: hoeveel proefklussen heeft deze werker nog over?
// Alleen lib/fiscal/eligibility.ts en de kaart "klaar voor je eerste klus" vragen dit, en alleen als er echt iets ontbreekt.

/** Meer aangenomen klussen dan dit lezen we niet: wie zoveel heeft, heeft geen proefruimte meer nodig. */
const LEES_MAX = 200;

/** De gewone client of een transactie (zoals lib/shifts/worker-overlap.ts). */
type Db = Pick<PrismaClient, "shiftAssignment"> | Pick<Prisma.TransactionClient, "shiftAssignment">;

export interface ProefklusRuimte {
  /** hoeveel proefklussen er nog over zijn; 0 = geen (ook bij een storing) */
  over: number;
  /** het aantal aangenomen echte klussen; null = niet te tellen (storing): dan geldt de gewone regel met de gewone melding */
  aangenomen: number | null;
}

/**
 * Telt de aangenomen klussen van deze werker, zonder testklussen (lib/shifts/testklus.ts: daar zit geen werk achter).
 * ShiftAssignment.freelancerId is het id van het profiel, daarom via de relatie op userId.
 * Een klus die de werker zelf afzegde of waar hij niet kwam opdagen telt ook (21 nov): anders kon aannemen, afzeggen en
 * opnieuw aannemen eindeloos. Dat herkennen we aan het begin van cancelReason, dezelfde regel als de opkomst
 * (workerMissed, lib/profile/card.ts); een annulering door de opdrachtgever of een overdracht aan een vervanger telt niet.
 * `db`: binnen een transactie (het slot in lib/fiscal/eligibility.ts, eisProefklusInSlot) de transactie zelf.
 * FAIL DICHT: bij een fout (of een onverwacht lange lijst) is er geen ruimte en geldt de gewone regel.
 */
export async function proefklusRuimte(userId: string, db: Db = prisma): Promise<ProefklusRuimte> {
  try {
    const rijen = await db.shiftAssignment.findMany({
      where: { freelancer: { userId }, OR: [{ cancelledAt: null }, workerMissWhere] },
      select: {
        cancelledAt: true,
        cancelReason: true,
        shift: { select: { title: true, createdAt: true, branch: { select: { tenantId: true, tenant: { select: { name: true } } } } } },
      },
      take: LEES_MAX,
    });
    if (rijen.length >= LEES_MAX) return { over: 0, aangenomen: null };
    const eigenTest = await leesEigenTest();
    const echt = rijen.filter(
      (r) =>
        telAlsProefklus(r) &&
        !isTestklus({
          title: r.shift.title,
          bedrijf: r.shift.branch.tenant.name,
          eigenTest: isEigenTestKlus(eigenTest, { tenantId: r.shift.branch.tenantId, createdAt: r.shift.createdAt }),
        }),
    ).length;
    return { over: proefklussenOver(echt), aangenomen: echt };
  } catch {
    return { over: 0, aangenomen: null };
  }
}

/** Telt deze toewijzing als aangenomen klus? Niet geannuleerd, of geannuleerd door de werker zelf (afgezegd, niet opgekomen). */
export function telAlsProefklus(a: { cancelledAt: Date | null; cancelReason: string | null }): boolean {
  return a.cancelledAt === null || workerMissed(a.cancelReason);
}
