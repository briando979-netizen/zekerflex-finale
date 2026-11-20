// ---------------------------------------------------------------------------
// Filters op de reacties van een klus (20 nov 2026, naar YoungOnes: "Is favoriet", "Minimale opkomst",
// "Minimaal zelf gewerkt", "Minimale beoordeling"). Puur: het scherm (components/werkgever/ReactieLijst.tsx) en de
// test delen dezelfde regels. Een reactie zonder cijfer (nieuw op ZekerFlex) valt alleen weg als er een minimum staat.
// ---------------------------------------------------------------------------

export interface ReactieVoorFilter {
  favoriet: boolean;
  attendancePct: number | null;
  shiftsCompleted: number;
  reviewAverage: number;
  reviewCount: number;
  proposedRateCents: number;
  listedRateCents: number;
}

export interface ReactieFilters {
  /** alleen favorieten */
  favoriet: boolean;
  /** minimale opkomst in procenten (0 = alle) */
  minOpkomst: number;
  /** minimaal aantal klussen gedaan (0 = alle) */
  minKlussen: number;
  /** minimale beoordeling in sterren (0 = alle) */
  minSterren: number;
  /** alleen reacties tegen het geplaatste tarief (geen tegenbod) */
  geenTegenbod: boolean;
}

export const LEGE_FILTERS: ReactieFilters = { favoriet: false, minOpkomst: 0, minKlussen: 0, minSterren: 0, geenTegenbod: false };

export const OPKOMST_KEUZES = [0, 80, 90, 95] as const;
export const KLUSSEN_KEUZES = [0, 5, 20, 50] as const;
export const STERREN_KEUZES = [0, 4, 4.5] as const;

export function filtersActief(f: ReactieFilters): number {
  return (f.favoriet ? 1 : 0) + (f.minOpkomst > 0 ? 1 : 0) + (f.minKlussen > 0 ? 1 : 0) + (f.minSterren > 0 ? 1 : 0) + (f.geenTegenbod ? 1 : 0);
}

export function voldoetAanFilters(r: ReactieVoorFilter, f: ReactieFilters): boolean {
  if (f.favoriet && !r.favoriet) return false;
  if (f.minOpkomst > 0 && (r.attendancePct === null || r.attendancePct < f.minOpkomst)) return false;
  if (f.minKlussen > 0 && r.shiftsCompleted < f.minKlussen) return false;
  if (f.minSterren > 0 && (r.reviewCount === 0 || r.reviewAverage < f.minSterren)) return false;
  if (f.geenTegenbod && r.proposedRateCents !== r.listedRateCents) return false;
  return true;
}

export function filterReacties<T extends ReactieVoorFilter>(reacties: readonly T[], f: ReactieFilters): { zichtbaar: T[]; verborgen: number } {
  const zichtbaar = reacties.filter((r) => voldoetAanFilters(r, f));
  return { zichtbaar, verborgen: reacties.length - zichtbaar.length };
}
