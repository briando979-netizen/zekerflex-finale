// ---------------------------------------------------------------------------
// Annuleringstermijn per klus (20 nov 2026, naar het voorbeeld van Temper en YoungOnes): het bedrijf kiest bij het
// plaatsen tot hoeveel uur vóór aanvang afzeggen kosteloos is. Daarna geldt de 50 %-regel uit lib/claims/policy.ts
// (de werker zegt te laat af → het bedrijf kan 50 % claimen; het bedrijf zegt af → de werker kan 50 % claimen).
// Puur bestand: ook de browser (NewShiftForm, SnelPlaatsen) leest het.
// ---------------------------------------------------------------------------

import { NOTICE_HOURS } from "@/lib/claims/policy";

/** De keuzes die een bedrijf krijgt, in uren vóór aanvang. */
export const ANNULEER_TERMIJNEN = [24, 48, 72, 168] as const;
export type AnnuleerTermijn = (typeof ANNULEER_TERMIJNEN)[number];

/** Zonder keuze geldt wat het platform altijd al beloofde (NOTICE_HOURS, 24 uur). */
export const STANDAARD_ANNULEER_UREN: AnnuleerTermijn = NOTICE_HOURS as AnnuleerTermijn;

export function isAnnuleerTermijn(uren: number): uren is AnnuleerTermijn {
  return (ANNULEER_TERMIJNEN as readonly number[]).includes(uren);
}

/** Een onbekende of ongeldige waarde (oude klus, kapotte invoer) valt terug op de standaard. */
export function annuleerUrenOf(uren: number | null | undefined): AnnuleerTermijn {
  return typeof uren === "number" && isAnnuleerTermijn(uren) ? uren : STANDAARD_ANNULEER_UREN;
}

/** "24 uur", "2 dagen", "3 dagen", "1 week" (en de Engelse variant). */
export function annuleerTermijnLabel(uren: number, locale: "nl" | "en" = "nl"): string {
  const nl = locale === "nl";
  if (uren >= 168 && uren % 168 === 0) {
    const w = uren / 168;
    return nl ? (w === 1 ? "1 week" : `${w} weken`) : w === 1 ? "1 week" : `${w} weeks`;
  }
  if (uren >= 48 && uren % 24 === 0) {
    const d = uren / 24;
    return nl ? `${d} dagen` : `${d} days`;
  }
  return nl ? `${uren} uur` : `${uren} hours`;
}

/** Tot wanneer afzeggen kosteloos is. */
export function afzegDeadline(startsAt: Date | string | number, uren: number): Date {
  return new Date(new Date(startsAt).getTime() - annuleerUrenOf(uren) * 3_600_000);
}
