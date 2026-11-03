// Pure rekenhulp voor het verdiendoel (ook in de browser bruikbaar, geen database).

/** Voortgang naar het doel: hoeveel procent van het doel is al gewerkt + gepland, en wat rest. */
export function goalProgress(
  goalCents: number,
  workedCents: number,
  expectedCents: number,
): { workedPct: number; expectedPct: number; remainingCents: number; reached: boolean } {
  const pct = (c: number) => Math.min(100, Math.round((c / goalCents) * 100));
  return {
    workedPct: pct(workedCents),
    expectedPct: pct(expectedCents),
    remainingCents: Math.max(0, goalCents - expectedCents),
    reached: expectedCents >= goalCents,
  };
}
