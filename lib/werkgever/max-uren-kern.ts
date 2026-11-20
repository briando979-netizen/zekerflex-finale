// Puur deel van lib/werkgever/max-uren.ts, ook voor de browser (components/werkgever/MaxUrenInstelling.tsx).

export const MAX_UREN_HOOGSTE = 2000;

/** De uren van één dienst (zonder pauze), nooit negatief. */
export function dienstUren(d: { startsAt: Date; endsAt: Date; breakMinutes: number }): number {
  return Math.max(0, (d.endsAt.getTime() - d.startsAt.getTime()) / 3_600_000 - d.breakMinutes / 60);
}

/** Past deze dienst nog binnen het maximum? (max 0 of leeg = geen grens) */
export function pastBinnenMaxUren(alUren: number, nieuwUren: number, max: number | undefined): boolean {
  if (!max || max <= 0) return true;
  return alUren + nieuwUren <= max;
}
