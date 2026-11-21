import { prisma } from "@/lib/prisma";
import { isTestklus } from "@/lib/shifts/testklus";
import { isEigenTestKlus } from "@/lib/admin/eigen-test-kern";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { proefklussenOver } from "@/lib/fiscal/proefklussen-kern";

// De telling bij lib/fiscal/proefklussen-kern.ts: hoeveel proefklussen heeft deze werker nog over?
// Alleen lib/fiscal/eligibility.ts en de kaart "klaar voor je eerste klus" vragen dit, en alleen als er echt iets ontbreekt.

/** Meer aangenomen klussen dan dit lezen we niet: wie zoveel heeft, heeft geen proefruimte meer nodig. */
const LEES_MAX = 200;

export interface ProefklusRuimte {
  /** hoeveel proefklussen er nog over zijn; 0 = geen (ook bij een storing) */
  over: number;
  /** het aantal aangenomen echte klussen; null = niet te tellen (storing): dan geldt de gewone regel met de gewone melding */
  aangenomen: number | null;
}

/**
 * Telt de aangenomen, niet geannuleerde klussen van deze werker, zonder testklussen (lib/shifts/testklus.ts: daar zit geen
 * werk achter). ShiftAssignment.freelancerId is het id van het profiel, daarom via de relatie op userId.
 * FAIL DICHT: bij een fout (of een onverwacht lange lijst) is er geen ruimte en geldt de gewone regel.
 */
export async function proefklusRuimte(userId: string): Promise<ProefklusRuimte> {
  try {
    const rijen = await prisma.shiftAssignment.findMany({
      where: { cancelledAt: null, freelancer: { userId } },
      select: { shift: { select: { title: true, createdAt: true, branch: { select: { tenantId: true, tenant: { select: { name: true } } } } } } },
      take: LEES_MAX,
    });
    if (rijen.length >= LEES_MAX) return { over: 0, aangenomen: null };
    const eigenTest = await leesEigenTest();
    const echt = rijen.filter(
      (r) =>
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
