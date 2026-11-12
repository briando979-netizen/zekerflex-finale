import type { PayrollRun } from "@/lib/payroll/store";

// Vangnet bij de overstap van de loonweek naar Nederlandse tijd (12 nov 2026, lib/payroll/week.ts): een dienst die al in
// een AFGERONDE loonrun van een buurweek staat, komt niet nog eens in een andere week (dan zou hij dubbel betaald worden).
// Puur; buildWeeklyRun (lib/payroll/engine.ts) haalt de buurweken op en filtert ermee. Een conceptrun telt niet: die
// wordt bij het opnieuw opbouwen toch opnieuw gelezen.

/** De sleutel van een regel op een loonstrook: dezelfde werker en dezelfde dienst. */
export function regelSleutel(userId: string, shiftId: string): string {
  return `${userId}:${shiftId}`;
}

/** Alle regels (werker + dienst) die al in een afgeronde loonrun staan. */
export function alBetaaldeRegels(runs: readonly (Pick<PayrollRun, "status" | "payslips"> | null)[]): Set<string> {
  const uit = new Set<string>();
  for (const run of runs) {
    if (!run || run.status !== "finalised") continue;
    for (const p of run.payslips) for (const l of p.computed.lines) uit.add(regelSleutel(p.userId, l.shiftId));
  }
  return uit;
}
