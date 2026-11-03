import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Lesplanning van een rijschool: vaste werktijden per instructeur, vrije
// lestijden op een dag en de controle op dubbele boekingen. Alle tijden zijn
// Nederlandse kloktijden; de server draait in UTC, dus alles loopt via
// lib/time/amsterdam (geen getHours/getDay). Puur, zodat het getest wordt.
// ---------------------------------------------------------------------------

/** Een vast werkblok: dag 1 = maandag … 7 = zondag, tijden als "08:30". */
export interface Werktijd {
  dag: number;
  van: string;
  tot: string;
}

export interface Blok {
  start: Date;
  eind: Date;
}

export const DAGNAMEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"] as const;

export const STANDAARD_WERKTIJDEN: Werktijd[] = [1, 2, 3, 4, 5].map((dag) => ({ dag, van: "08:00", tot: "18:00" }));

const TIJD = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

const minutenVan = (t: string): number | null => {
  const m = TIJD.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Werktijden uit de database: alleen geldige blokken, van vóór tot. */
export function leesWerktijden(json: unknown): Werktijd[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((w): Werktijd[] => {
    if (!w || typeof w !== "object") return [];
    const { dag, van, tot } = w as Record<string, unknown>;
    if (typeof dag !== "number" || !Number.isInteger(dag) || dag < 1 || dag > 7) return [];
    if (typeof van !== "string" || typeof tot !== "string") return [];
    const a = minutenVan(van);
    const b = minutenVan(tot);
    return a !== null && b !== null && a < b ? [{ dag, van, tot }] : [];
  });
}

export const overlapt = (a: Blok, b: Blok) => a.start < b.eind && b.start < a.eind;

/** "2026-11-03" → de dag van de week, 1 = maandag … 7 = zondag. */
export function weekdagVan(datum: string): number {
  const m = DATUM.exec(datum);
  if (!m) throw new Error(`Geen datum: ${datum}`);
  const zondag0 = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return zondag0 === 0 ? 7 : zondag0;
}

/** Een Nederlandse datum + kloktijd als echt moment. */
export function moment(datum: string, tijd: string): Date {
  const d = DATUM.exec(datum);
  const t = TIJD.exec(tijd);
  if (!d || !t) throw new Error(`Geen datum of tijd: ${datum} ${tijd}`);
  return amsterdamToUtc(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]));
}

/** "2026-11-03" + 2 → "2026-11-05" (kalenderdagen, los van zomertijd). */
export function plusDagen(datum: string, n: number): string {
  const m = DATUM.exec(datum);
  if (!m) throw new Error(`Geen datum: ${datum}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + n * 86_400_000).toISOString().slice(0, 10);
}

/** De maandag van de week waarin deze datum valt. */
export const maandagVan = (datum: string) => plusDagen(datum, 1 - weekdagVan(datum));

export const isDatum = (s: string) => DATUM.test(s);
export const isTijd = (s: string) => TIJD.test(s);

/** De komende `aantal` Nederlandse kalenderdagen vanaf vandaag, als "2026-11-03". */
export function komendeDagen(nu: Date, aantal: number): string[] {
  const p = amsterdamParts(nu);
  const basis = Date.UTC(p.year, p.month - 1, p.day);
  return Array.from({ length: aantal }, (_, i) => new Date(basis + i * 86_400_000).toISOString().slice(0, 10));
}

export interface VrijeTijdenInput {
  werktijden: Werktijd[];
  /** lessen en afspraken die al vastliggen (geannuleerde niet meegeven) */
  bezet: Blok[];
  datum: string;
  duurMin: number;
  /** om de hoeveel minuten een les kan beginnen */
  stapMin?: number;
  nu: Date;
  /** zo lang van tevoren moet een les minstens geboekt worden */
  minVoorafMin?: number;
  /** reistijd/pauze tussen twee lessen */
  tussenMin?: number;
}

/** De begintijden waarop op deze dag een les van `duurMin` past. */
export function vrijeTijden(input: VrijeTijdenInput): Date[] {
  const stap = input.stapMin ?? 30;
  const tussen = input.tussenMin ?? 0;
  const vroegst = input.nu.getTime() + (input.minVoorafMin ?? 0) * 60_000;
  const dag = weekdagVan(input.datum);
  const uit: Date[] = [];
  for (const w of input.werktijden.filter((x) => x.dag === dag)) {
    const van = minutenVan(w.van);
    const tot = minutenVan(w.tot);
    if (van === null || tot === null) continue;
    for (let m = van; m + input.duurMin <= tot; m += stap) {
      const start = moment(input.datum, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
      if (start.getTime() < vroegst) continue;
      const blok = {
        start: new Date(start.getTime() - tussen * 60_000),
        eind: new Date(start.getTime() + (input.duurMin + tussen) * 60_000),
      };
      if (input.bezet.some((b) => overlapt(blok, b))) continue;
      if (!uit.some((u) => u.getTime() === start.getTime())) uit.push(start);
    }
  }
  return uit.sort((a, b) => a.getTime() - b.getTime());
}

export interface Bestaand extends Blok {
  id: string;
  instructeurId: string;
  leerlingId: string | null;
  voertuigId: string | null;
}

/** Waarom een nieuwe les niet past, of null als hij past. */
export function conflict(
  nieuw: Blok & { instructeurId: string; leerlingId: string | null; voertuigId: string | null; id?: string },
  bestaand: Bestaand[],
): string | null {
  if (nieuw.eind <= nieuw.start) return "De les moet na de begintijd eindigen.";
  for (const b of bestaand) {
    if (b.id === nieuw.id || !overlapt(nieuw, b)) continue;
    if (b.instructeurId === nieuw.instructeurId) return "De instructeur heeft op dat moment al een les.";
    if (nieuw.leerlingId && b.leerlingId === nieuw.leerlingId) return "De leerling heeft op dat moment al een les.";
    if (nieuw.voertuigId && b.voertuigId === nieuw.voertuigId) return "De auto is op dat moment al ingepland.";
  }
  return null;
}
