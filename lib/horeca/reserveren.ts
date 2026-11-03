import { leesTijden, type Dag } from "@/lib/horeca/tijden";

// ---------------------------------------------------------------------------
// Tafels reserveren bij een horecazaak: welke tijden vrij zijn en of een
// reservering past. Een reservering bezet "verblijfMinuten" lang zijn
// personen; een tijd is vrij als op elk moment van dat verblijf het aantal
// gasten onder de capaciteit blijft. De laatste tijd is zo gekozen dat het
// verblijf vóór sluitingstijd eindigt. Puur, dus ook in de browser bruikbaar
// en los te testen.
// ---------------------------------------------------------------------------

export interface ReserveerInstellingen {
  /** om de hoeveel minuten je kunt reserveren */
  slotMinuten: 15 | 30 | 60;
  /** hoe lang een tafel bezet is */
  verblijfMinuten: number;
  /** grotere groepen bellen (of de zaak boekt ze zelf in) */
  maxGroep: number;
  /** hoeveel dagen vooruit online te reserveren */
  dagenVooruit: number;
  /** hoeveel gasten tegelijk; 0 = de plaatsen van de actieve tafels */
  maxGasten: number;
}

export const STANDAARD_RESERVEREN: ReserveerInstellingen = { slotMinuten: 30, verblijfMinuten: 120, maxGroep: 8, dagenVooruit: 60, maxGasten: 0 };

const getal = (v: unknown, min: number, max: number, std: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : std);

export function leesInstellingen(json: unknown): ReserveerInstellingen {
  const b = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const slot = b.slotMinuten === 15 || b.slotMinuten === 30 || b.slotMinuten === 60 ? b.slotMinuten : STANDAARD_RESERVEREN.slotMinuten;
  return {
    slotMinuten: slot,
    verblijfMinuten: getal(b.verblijfMinuten, 30, 360, STANDAARD_RESERVEREN.verblijfMinuten),
    maxGroep: getal(b.maxGroep, 1, 100, STANDAARD_RESERVEREN.maxGroep),
    dagenVooruit: getal(b.dagenVooruit, 1, 365, STANDAARD_RESERVEREN.dagenVooruit),
    maxGasten: getal(b.maxGasten, 0, 2000, STANDAARD_RESERVEREN.maxGasten),
  };
}

/** Zonder tafels en zonder eigen instelling: zoveel gasten tegelijk (de zaak past het aan). */
export const STANDAARD_CAPACITEIT = 40;

/** De capaciteit: ingesteld, anders de plaatsen van de actieve tafels, anders de standaard. */
export const capaciteit = (inst: ReserveerInstellingen, tafelPlaatsen: number) => inst.maxGasten || tafelPlaatsen || STANDAARD_CAPACITEIT;

export const minuten = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const klok = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Weekdag (0 = zondag) van "JJJJ-MM-DD". */
export const weekdag = (datum: string): Dag => String(new Date(`${datum}T12:00:00Z`).getUTCDay()) as Dag;

export const plusDagen = (datum: string, n: number) => {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const isDatum = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

/**
 * Alle reserveertijden van een dag als minuten na middernacht (na 24:00 kan,
 * als de zaak na middernacht sluit). Leeg als de zaak dicht is.
 */
export function slotsOp(datum: string, openingstijden: unknown, inst: ReserveerInstellingen): number[] {
  const open = leesTijden(openingstijden)[weekdag(datum)];
  if (!open) return [];
  const van = minuten(open.van);
  let tot = minuten(open.tot);
  if (tot <= van) tot += 24 * 60; // sluit na middernacht
  const uit: number[] = [];
  const eersteSlot = Math.ceil(van / inst.slotMinuten) * inst.slotMinuten;
  for (let m = eersteSlot; m + inst.verblijfMinuten <= tot; m += inst.slotMinuten) uit.push(m);
  return uit;
}

export interface Bezet {
  tijd: string;
  personen: number;
}

/** Past een groep op starttijd t (minuten), gegeven wat er al staat? */
export function pastOp(t: number, personen: number, bezet: readonly Bezet[], inst: ReserveerInstellingen, cap: number): boolean {
  const duur = inst.verblijfMinuten;
  const starts = bezet.map((b) => ({ m: minuten(b.tijd), p: b.personen }));
  // meetmomenten: het begin, en elk begin van een andere reservering binnen ons verblijf
  const momenten = [t, ...starts.map((s) => s.m).filter((m) => m > t && m < t + duur)];
  return momenten.every((x) => starts.filter((s) => s.m <= x && x < s.m + duur).reduce((som, s) => som + s.p, 0) + personen <= cap);
}

/** De tijden van een dag met of ze vrij zijn, voor een groep van zoveel personen. */
export function beschikbaarheid(
  datum: string,
  personen: number,
  openingstijden: unknown,
  inst: ReserveerInstellingen,
  cap: number,
  bezet: readonly Bezet[],
  nu: { datum: string; minuten: number },
): { tijd: string; vrij: boolean }[] {
  return slotsOp(datum, openingstijden, inst)
    .filter((m) => datum > nu.datum || m >= nu.minuten + 30) // vandaag: minstens een half uur vooruit
    .map((m) => ({ tijd: klok(m), vrij: pastOp(m, personen, bezet, inst, cap) }));
}

/** Kan de gast nog zelf annuleren? Alleen een bevestigde reservering die nog niet begonnen is. */
export function magAnnuleren(r: { status: string; datum: string; tijd: string }, nu: { datum: string; minuten: number }): boolean {
  if (r.status !== "BEVESTIGD") return false;
  if (r.datum !== nu.datum) return r.datum > nu.datum;
  return minuten(r.tijd) > nu.minuten;
}

/** Waarom een online reservering niet kan, of null. */
export function reserveerFout(
  r: { datum: string; tijd: string; personen: number },
  openingstijden: unknown,
  inst: ReserveerInstellingen,
  cap: number,
  bezet: readonly Bezet[],
  nu: { datum: string; minuten: number },
): string | null {
  if (!isDatum(r.datum) || r.datum < nu.datum) return "Kies een datum vanaf vandaag.";
  if (r.datum > plusDagen(nu.datum, inst.dagenVooruit)) return `Online reserveren kan tot ${inst.dagenVooruit} dagen vooruit. Bel ons voor later.`;
  if (!Number.isInteger(r.personen) || r.personen < 1) return "Kies met hoeveel personen je komt.";
  if (r.personen > inst.maxGroep) return `Voor groepen groter dan ${inst.maxGroep} personen: bel ons, dan regelen we het samen.`;
  const slot = beschikbaarheid(r.datum, r.personen, openingstijden, inst, cap, bezet, nu).find((s) => s.tijd === r.tijd);
  if (!slot) return slotsOp(r.datum, openingstijden, inst).length ? "Kies een van de tijden die vrij zijn." : "Op die dag zijn we gesloten.";
  if (!slot.vrij) return "Die tijd is net vol geraakt. Kies een andere tijd.";
  return null;
}
