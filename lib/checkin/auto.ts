// ---------------------------------------------------------------------------
// Automatisch in- en uitchecken: de beslissing op basis van de locatie van de
// telefoon, de geofence van de vestiging en de geplande tijden. Puur bestand,
// draait in de browser (components/app/AutoCheckin.tsx) en in tests.
//
// Regels (bewust voorzichtig, want een check-in bepaalt uren):
//   - inchecken zodra je binnen de geofence bent, vanaf 15 minuten vóór de
//     geplande start, en pas na twee metingen achter elkaar binnen (geen
//     eenmalige gps-stuiter);
//   - uitchecken zodra je na de geplande start 5 minuten aaneengesloten buiten
//     de geofence bent, of na het geplande einde zodra je buiten bent;
//   - nooit uitchecken binnen 10 minuten na het inchecken (even naar de auto);
//   - een meting met een nauwkeurigheid slechter dan 150 m telt niet.
// ---------------------------------------------------------------------------

export interface AutoStand {
  /** laatste twee uitslagen binnen/buiten (true = binnen) */
  reeks: boolean[];
  /** sinds wanneer aaneengesloten buiten (ms), of null */
  buitenSinds: number | null;
}

export interface AutoInvoer {
  now: number;
  afstandMeters: number;
  nauwkeurigheidMeters: number;
  geofenceMeters: number;
  geplandeStart: number;
  geplandEinde: number;
  ingecheckt: number | null;
  uitgecheckt: number | null;
}

export const START_MARGE_MS = 15 * 60_000;
export const BUITEN_MS = 5 * 60_000;
export const MIN_INGECHECKT_MS = 10 * 60_000;
export const MAX_NAUWKEURIGHEID = 150;

export const beginStand = (): AutoStand => ({ reeks: [], buitenSinds: null });

export type AutoBesluit = { actie: "CHECK_IN" | "CHECK_OUT" | null; stand: AutoStand; binnen: boolean | null };

export function besluit(i: AutoInvoer, s: AutoStand): AutoBesluit {
  if (i.nauwkeurigheidMeters > MAX_NAUWKEURIGHEID) return { actie: null, stand: s, binnen: null };
  // ruimer dan de harde geofence: de nauwkeurigheid telt in je voordeel (zoals evaluateGeofence)
  const binnen = i.afstandMeters <= i.geofenceMeters + Math.min(i.nauwkeurigheidMeters, 50);
  const reeks = [...s.reeks, binnen].slice(-2);
  const buitenSinds = binnen ? null : (s.buitenSinds ?? i.now);
  const stand: AutoStand = { reeks, buitenSinds };

  if (i.uitgecheckt) return { actie: null, stand, binnen };

  if (!i.ingecheckt) {
    const mag = i.now >= i.geplandeStart - START_MARGE_MS && i.now <= i.geplandEinde;
    const tweeKeerBinnen = reeks.length === 2 && reeks.every(Boolean);
    return { actie: mag && tweeKeerBinnen ? "CHECK_IN" : null, stand, binnen };
  }

  const langGenoegBinnen = i.now - i.ingecheckt >= MIN_INGECHECKT_MS;
  const naStart = i.now >= i.geplandeStart;
  const langBuiten = buitenSinds !== null && i.now - buitenSinds >= BUITEN_MS;
  const naEindeEnBuiten = i.now >= i.geplandEinde && !binnen;
  return { actie: langGenoegBinnen && naStart && (langBuiten || naEindeEnBuiten) ? "CHECK_OUT" : null, stand, binnen };
}

/** Hoe vaak de telefoon kijkt: vaker rond de start en het einde, zuinig ertussen. */
export function meetInterval(now: number, geplandeStart: number, geplandEinde: number): number {
  const dichtbij = Math.abs(now - geplandeStart) < 30 * 60_000 || Math.abs(now - geplandEinde) < 30 * 60_000;
  return dichtbij ? 60_000 : 5 * 60_000;
}
