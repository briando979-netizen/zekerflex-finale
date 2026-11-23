// ---------------------------------------------------------------------------
// Filters op de reacties van een klus (20 nov 2026, naar YoungOnes: "Is favoriet", "Minimale opkomst",
// "Minimaal zelf gewerkt", "Minimale beoordeling", "Ervaring in gelijke sector / functie", "In bezit van KVK"). Puur: het
// scherm (components/werkgever/ReactieLijst.tsx) en de test delen dezelfde regels. Een reactie zonder cijfer (nieuw op
// ZekerFlex) valt alleen weg als er een minimum staat. Alleen filters waarvoor wij echte gegevens hebben
// (lib/employer/prestaties-kern.ts).
// ---------------------------------------------------------------------------

export interface ReactieVoorFilter {
  favoriet: boolean;
  /** % compleet (opkomst); null = te weinig klussen */
  attendancePct: number | null;
  shiftsCompleted: number;
  reviewAverage: number;
  reviewCount: number;
  proposedRateCents: number;
  listedRateCents: number;
  /** % zelf aanwezig; null = te weinig klussen */
  zelfPct?: number | null | undefined;
  /** werkte eerder in dezelfde sector als deze klus */
  zelfdeSector?: boolean | undefined;
  /** werkte eerder in dezelfde functie als deze klus */
  zelfdeFunctie?: boolean | undefined;
  /** heeft een gecontroleerde KVK-inschrijving */
  kvk?: boolean | undefined;
}

export interface ReactieFilters {
  /** alleen favorieten */
  favoriet: boolean;
  /** minimale opkomst in procenten (0 = alle) */
  minOpkomst: number;
  /** minimaal zelf gewerkt in procenten (0 = alle) */
  minZelf: number;
  /** minimaal aantal klussen gedaan (0 = alle) */
  minKlussen: number;
  /** minimale beoordeling in sterren (0 = alle) */
  minSterren: number;
  /** alleen reacties tegen het geplaatste tarief (geen tegenbod) */
  geenTegenbod: boolean;
  zelfdeSector: boolean;
  zelfdeFunctie: boolean;
  kvk: boolean;
}

export const LEGE_FILTERS: ReactieFilters = {
  favoriet: false,
  minOpkomst: 0,
  minZelf: 0,
  minKlussen: 0,
  minSterren: 0,
  geenTegenbod: false,
  zelfdeSector: false,
  zelfdeFunctie: false,
  kvk: false,
};

export const OPKOMST_KEUZES = [0, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10] as const;
export const KLUSSEN_KEUZES = [0, 5, 20, 50] as const;
export const STERREN_KEUZES = [0, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5] as const;

export function filtersActief(f: ReactieFilters): number {
  return (
    (f.favoriet ? 1 : 0) +
    (f.minOpkomst > 0 ? 1 : 0) +
    (f.minZelf > 0 ? 1 : 0) +
    (f.minKlussen > 0 ? 1 : 0) +
    (f.minSterren > 0 ? 1 : 0) +
    (f.geenTegenbod ? 1 : 0) +
    (f.zelfdeSector ? 1 : 0) +
    (f.zelfdeFunctie ? 1 : 0) +
    (f.kvk ? 1 : 0)
  );
}

export function voldoetAanFilters(r: ReactieVoorFilter, f: ReactieFilters): boolean {
  if (f.favoriet && !r.favoriet) return false;
  if (f.minOpkomst > 0 && (r.attendancePct === null || r.attendancePct < f.minOpkomst)) return false;
  if (f.minZelf > 0 && (r.zelfPct === null || r.zelfPct === undefined || r.zelfPct < f.minZelf)) return false;
  if (f.minKlussen > 0 && r.shiftsCompleted < f.minKlussen) return false;
  if (f.minSterren > 0 && (r.reviewCount === 0 || r.reviewAverage < f.minSterren)) return false;
  if (f.geenTegenbod && r.proposedRateCents !== r.listedRateCents) return false;
  if (f.zelfdeSector && !r.zelfdeSector) return false;
  if (f.zelfdeFunctie && !r.zelfdeFunctie) return false;
  if (f.kvk && !r.kvk) return false;
  return true;
}

export function filterReacties<T extends ReactieVoorFilter>(reacties: readonly T[], f: ReactieFilters): { zichtbaar: T[]; verborgen: number } {
  const zichtbaar = reacties.filter((r) => voldoetAanFilters(r, f));
  return { zichtbaar, verborgen: reacties.length - zichtbaar.length };
}
