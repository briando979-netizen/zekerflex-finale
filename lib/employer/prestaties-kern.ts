import { workerMissed } from "@/lib/profile/card";
import { shiftCategory } from "@/lib/shifts/category";
import { dienstUren } from "@/lib/werkgever/max-uren-kern";

// ---------------------------------------------------------------------------
// De cijfers van een werker op de kluspagina van een bedrijf en in de profielkaart (23 nov 2026, naar YoungOnes:
// "Prestaties van de afgelopen 6 maanden", "Uren (12 mnd)", "Actieve regio's"). Puur: alles komt uit de inplanningen
// (ShiftAssignment) die de aanroeper ophaalt (lib/employer/prestaties.ts, lib/employer/candidate-card.ts).
// Wat telt:
//   - zelf gewerkt     = niet geannuleerd en ingecheckt of uren ingediend;
//   - vervanging       = overgedragen aan een vervanger (cancelReason van lib/replacements/reassign.ts);
//   - niet voltooid    = zelf afgezegd of niet opgekomen (workerMissed, lib/profile/card.ts), of geen uren na een week;
//   - telt niet mee    = door het bedrijf geannuleerd, of korter dan een week geleden afgelopen zonder uren (nog onbekend).
// Verzin nooit een getal: bij minder dan MIN_VOOR_PERCENTAGE klussen is er geen percentage ("Nieuw op ZekerFlex").
// ---------------------------------------------------------------------------

export interface PrestatieRij {
  shiftId: string;
  /** het bedrijf van de klus */
  tenantId: string;
  cancelledAt: Date | null;
  cancelReason: string | null;
  timesheet: { status: string; actualStart: Date | null; billableMinutes: number } | null;
  shift: {
    title: string;
    /** naam van de gevraagde vaardigheid, als de klus die heeft */
    skill: string | null;
    startsAt: Date;
    endsAt: Date;
    breakMinutes: number;
    city: string;
    lat: number;
    lng: number;
  };
}

/** Het begin van de reden waarmee een overdracht aan een vervanger wordt vastgelegd (lib/replacements/reassign.ts). */
export const VERVANGEN_VOORVOEGSEL = "Vervangen via ZekerFlex";
export const DAG_MS = 86_400_000;
/** "de laatste 6 maanden" */
export const ZES_MAANDEN_MS = 183 * DAG_MS;
/** "de laatste 12 maanden" */
export const JAAR_MS = 365 * DAG_MS;
/** zo lang mag een urenstaat op zich laten wachten voordat een klus zonder uren als niet voltooid telt */
export const UREN_WACHTTIJD_MS = 7 * DAG_MS;
/** onder dit aantal klussen in 6 maanden tonen we geen percentage */
export const MIN_VOOR_PERCENTAGE = 3;

const KWAM_STATUSSEN = ["SUBMITTED", "APPROVED", "DISPUTED", "PAID"];

/** Heeft de werker deze klus zelf gewerkt? (ingecheckt, of uren ingediend) */
export function zelfGewerkt(r: Pick<PrestatieRij, "cancelledAt" | "timesheet">): boolean {
  if (r.cancelledAt) return false;
  return r.timesheet?.actualStart != null || KWAM_STATUSSEN.includes(r.timesheet?.status ?? "");
}

export function isVervangen(r: Pick<PrestatieRij, "cancelledAt" | "cancelReason">): boolean {
  return Boolean(r.cancelledAt) && (r.cancelReason ?? "").startsWith(VERVANGEN_VOORVOEGSEL);
}

export interface Prestaties {
  /** klussen waarvoor de werker was uitgekozen (zelf gewerkt + vervanging geregeld + niet voltooid) */
  gematcht: number;
  nietVoltooid: number;
  vervanging: number;
  zelf: number;
  /** % van de gematchte klussen dat is gedaan, door de werker zelf of door zijn vervanger; null bij te weinig klussen */
  compleetPct: number | null;
  /** % van de gematchte klussen dat de werker zelf deed; null bij te weinig klussen */
  zelfPct: number | null;
}

export const GEEN_PRESTATIES: Prestaties = { gematcht: 0, nietVoltooid: 0, vervanging: 0, zelf: 0, compleetPct: null, zelfPct: null };

/** De drie cijfers en de twee percentages over de klussen die in de laatste 6 maanden afliepen. */
export function telPrestaties(rijen: readonly PrestatieRij[], now: Date): Prestaties {
  const nu = now.getTime();
  let zelf = 0;
  let vervanging = 0;
  let nietVoltooid = 0;
  for (const r of rijen) {
    const eind = r.shift.endsAt.getTime();
    if (eind >= nu || eind < nu - ZES_MAANDEN_MS) continue;
    if (r.cancelledAt) {
      if (isVervangen(r)) vervanging += 1;
      else if (workerMissed(r.cancelReason)) nietVoltooid += 1;
      continue;
    }
    if (zelfGewerkt(r)) zelf += 1;
    else if (eind < nu - UREN_WACHTTIJD_MS) nietVoltooid += 1;
  }
  const gematcht = zelf + vervanging + nietVoltooid;
  const genoeg = gematcht >= MIN_VOOR_PERCENTAGE;
  return {
    gematcht,
    nietVoltooid,
    vervanging,
    zelf,
    compleetPct: genoeg ? Math.round(((zelf + vervanging) / gematcht) * 100) : null,
    zelfPct: genoeg ? Math.round((zelf / gematcht) * 100) : null,
  };
}

/**
 * Uren die de werker in de laatste 12 maanden zelf bij dit bedrijf werkte: de goedgekeurde of ingediende minuten als die
 * er zijn, anders de geplande tijd van de klus zonder pauze. Geplande klussen in de toekomst tellen niet.
 */
export function gewerkteUrenBij(rijen: readonly PrestatieRij[], tenantId: string, now: Date): number {
  const nu = now.getTime();
  let uren = 0;
  for (const r of rijen) {
    const eind = r.shift.endsAt.getTime();
    if (r.tenantId !== tenantId || eind >= nu || eind < nu - JAAR_MS || !zelfGewerkt(r)) continue;
    const minuten = r.timesheet?.billableMinutes ?? 0;
    uren += minuten > 0 ? minuten / 60 : dienstUren(r.shift);
  }
  return Math.round(uren * 10) / 10;
}

export interface Regio {
  /** de plaats van de vestiging waar gewerkt is */
  naam: string;
  /** het midden van die vestigingen, afgerond op ongeveer een kilometer: geen adres van een ander bedrijf */
  lat: number;
  lng: number;
  klussen: number;
}

/**
 * De plaatsen waar de werker in de laatste 12 maanden zelf werkte. `verborgen` zijn bedrijven waarvan de klussen voor
 * deze kijker niet bestaan (eigen-testbedrijven, lib/admin/eigen-test-regel.ts).
 */
export function actieveRegios(rijen: readonly PrestatieRij[], now: Date, verborgen: ReadonlySet<string> = new Set()): Regio[] {
  const nu = now.getTime();
  const perPlaats = new Map<string, { naam: string; lat: number; lng: number; n: number }>();
  for (const r of rijen) {
    const eind = r.shift.endsAt.getTime();
    if (eind >= nu || eind < nu - JAAR_MS || !zelfGewerkt(r) || verborgen.has(r.tenantId)) continue;
    const naam = r.shift.city.trim();
    if (!naam || !Number.isFinite(r.shift.lat) || !Number.isFinite(r.shift.lng)) continue;
    const sleutel = naam.toLowerCase();
    const p = perPlaats.get(sleutel) ?? { naam, lat: 0, lng: 0, n: 0 };
    p.lat += r.shift.lat;
    p.lng += r.shift.lng;
    p.n += 1;
    perPlaats.set(sleutel, p);
  }
  return [...perPlaats.values()]
    .map((p) => ({ naam: p.naam, lat: Math.round((p.lat / p.n) * 100) / 100, lng: Math.round((p.lng / p.n) * 100) / 100, klussen: p.n }))
    .sort((a, b) => b.klussen - a.klussen || a.naam.localeCompare(b.naam, "nl"));
}

/** Werkte de werker eerder zelf in dezelfde sector, en in dezelfde functie, als deze klus? */
export function ervaringIn(rijen: readonly PrestatieRij[], klus: { title: string; skill: string | null }, now: Date): { sector: boolean; functie: boolean } {
  const nu = now.getTime();
  const sector = shiftCategory(klus.title, klus.skill).key;
  const functie = (klus.skill ?? klus.title).trim().toLowerCase();
  let inSector = false;
  let inFunctie = false;
  for (const r of rijen) {
    if (r.shift.endsAt.getTime() >= nu || !zelfGewerkt(r)) continue;
    if (shiftCategory(r.shift.title, r.shift.skill).key === sector) inSector = true;
    if (functie && (r.shift.skill ?? r.shift.title).trim().toLowerCase() === functie) inFunctie = true;
    if (inSector && inFunctie) break;
  }
  return { sector: inSector, functie: inFunctie };
}

/** Staat de werker die dag al bij dit bedrijf ingepland op een andere klus? */
export function alGematchtOpDag(rijen: readonly PrestatieRij[], klus: { id: string; tenantId: string }, dagStart: Date, dagEind: Date): boolean {
  return rijen.some(
    (r) => !r.cancelledAt && r.tenantId === klus.tenantId && r.shiftId !== klus.id && r.shift.startsAt >= dagStart && r.shift.startsAt < dagEind,
  );
}
