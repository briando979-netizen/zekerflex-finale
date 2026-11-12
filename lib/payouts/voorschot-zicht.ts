// Welke voorschotten de werker zelf ziet. Puur (geen prisma), zodat de API, de klusdetailpagina en de test hetzelfde
// gebruiken. Beheer leest AdvanceRecord rechtstreeks en ziet alles.
//
// Een loonvoorschot (kind "payroll") dat op FAILED staat zonder betaalreferentie en zonder betaaldatum is nooit
// uitbetaald: er ging geen geld naar de werker en het wordt niet op het loon ingehouden (alleen SUBMITTED/SETTLED met
// paidAt wordt verrekend). Gemeten 12 nov: 12 zulke regels, alle bij één werker, van vóór de poort in
// createPayrollAdvance. In zijn overzicht stonden ze als "lopend voorschot, wordt verrekend met je volgende
// uitbetaling" en op de klus als "je voorschot staat op je rekening"; dat klopte niet.

export interface VoorschotVelden {
  kind?: "manual" | "payroll" | null | undefined;
  payoutStatus?: string | null | undefined;
  providerRef?: string | null | undefined;
  paidAt?: string | Date | null | undefined;
}

/** Een loonvoorschot dat nooit is uitbetaald (FAILED, geen referentie, geen betaaldatum). */
export function nooitUitbetaaldLoonvoorschot(a: VoorschotVelden): boolean {
  return a.kind === "payroll" && a.payoutStatus === "FAILED" && !a.providerRef && !a.paidAt;
}

/** De voorschotten die de werker in zijn eigen overzicht ziet. */
export function voorschottenVoorWerker<T extends VoorschotVelden>(lijst: readonly T[]): T[] {
  return lijst.filter((a) => !nooitUitbetaaldLoonvoorschot(a));
}
