// ---------------------------------------------------------------------------
// De planning van het eigen personeel van een horecazaak (ronde 3, 15 nov 2026): rooster, niet-beschikbaar, dienst ruilen of een
// open dienst nemen, verlof en gewerkte uren. Dit bestand is puur: de vorm, de grenzen en de berekeningen, zonder zod, opslag
// of klok (alles komt als tekst "JJJJ-MM-DD" en "UU:MM", in Amsterdamse tijd, zodat er geen tijdzone-omrekening nodig is). Het
// bewaren staat in planning-store.ts, de tekst in planning-teksten.ts.
// ---------------------------------------------------------------------------

export const MAX_DIENSTEN = 3000;
export const MAX_UREN = 4000;
export const MAX_RUILEN = 400;
export const MAX_VERLOF = 400;
export const MAX_NIET_BESCHIKBAAR = 1500;

export const RUIL_STATUSSEN = ["aangeboden", "geaccepteerd", "goedgekeurd", "afgewezen", "ingetrokken"] as const;
export type RuilStatus = (typeof RUIL_STATUSSEN)[number];
export const VERLOF_STATUSSEN = ["aangevraagd", "goedgekeurd", "afgewezen", "ingetrokken"] as const;
export type VerlofStatus = (typeof VERLOF_STATUSSEN)[number];

export interface Dienst {
  id: string;
  /** null = een open dienst die iemand kan nemen */
  medewerkerId: string | null;
  datum: string;
  van: string;
  tot: string;
  notitie: string;
}

export interface NietBeschikbaar {
  id: string;
  medewerkerId: string;
  datum: string;
  notitie: string;
}

export interface Ruil {
  id: string;
  dienstId: string;
  /** wie de dienst afstaat; null bij een open dienst die iemand wil nemen */
  van: string | null;
  /** wie hem overneemt; null zolang niemand zich heeft gemeld */
  naar: string | null;
  status: RuilStatus;
  op: string;
}

export interface Verlof {
  id: string;
  medewerkerId: string;
  van: string;
  tot: string;
  reden: string;
  status: VerlofStatus;
  op: string;
}

export interface Uur {
  id: string;
  medewerkerId: string;
  datum: string;
  in: string;
  /** null zolang hij nog is ingeklokt */
  uit: string | null;
  bron: "klok" | "beheer";
}

export interface Planning {
  versie: 1;
  diensten: Dienst[];
  nietBeschikbaar: NietBeschikbaar[];
  ruilen: Ruil[];
  verlof: Verlof[];
  uren: Uur[];
}

export const legePlanning = (): Planning => ({ versie: 1, diensten: [], nietBeschikbaar: [], ruilen: [], verlof: [], uren: [] });

// ---- datum en tijd ---------------------------------------------------------

export const isDatum = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [j, m, d] = s.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(j, m - 1, d));
  return t.getUTCFullYear() === j && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export const isTijd = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

const naarUtc = (datum: string): number => {
  const [j, m, d] = datum.split("-").map(Number) as [number, number, number];
  return Date.UTC(j, m - 1, d);
};

/** Een datum een aantal dagen verder (of terug), zonder tijdzone-sprongen. */
export function plusDagen(datum: string, n: number): string {
  return new Date(naarUtc(datum) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = maandag tot en met 6 = zondag. */
export const dagNummer = (datum: string): number => (new Date(naarUtc(datum)).getUTCDay() + 6) % 7;

/** De maandag van de week waarin deze datum valt. */
export const weekStart = (datum: string): string => plusDagen(datum, -dagNummer(datum));

export const weekDagen = (start: string): string[] => Array.from({ length: 7 }, (_, i) => plusDagen(start, i));

/** Het aantal dagen tussen twee datums (tot min van). */
export const dagenTussen = (van: string, tot: string): number => Math.round((naarUtc(tot) - naarUtc(van)) / 86_400_000);

const naarMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** De duur in minuten; een eindtijd gelijk aan of voor de begintijd is na middernacht. */
export function duurMinuten(van: string, tot: string): number {
  const m = naarMin(tot) - naarMin(van);
  return m > 0 ? m : m + 1440;
}

export const urenTekst = (minuten: number): string => `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, "0")}`;

/** Het begin en einde van een dienst in minuten vanaf het begin van de datum (het einde kan boven 1440 komen). */
const venster = (d: Pick<Dienst, "van" | "tot">): [number, number] => [naarMin(d.van), naarMin(d.van) + duurMinuten(d.van, d.tot)];

/** Overlappen twee diensten op dezelfde datum? Een dienst die na middernacht doorloopt telt alleen op zijn eigen datum. */
export function overlapt(a: Pick<Dienst, "datum" | "van" | "tot">, b: Pick<Dienst, "datum" | "van" | "tot">): boolean {
  if (a.datum !== b.datum) return false;
  const [a1, a2] = venster(a);
  const [b1, b2] = venster(b);
  return a1 < b2 && b1 < a2;
}

// ---- waarschuwingen bij het plannen ---------------------------------------

export type PlanWaarschuwing = "verlof" | "niet-beschikbaar" | "overlap";

/** Wat er bij deze dienst niet klopt (een waarschuwing, geen verbod: de beheerder beslist). */
export function waarschuwingen(p: Planning, d: Pick<Dienst, "medewerkerId" | "datum" | "van" | "tot"> & { id?: string }): PlanWaarschuwing[] {
  const uit: PlanWaarschuwing[] = [];
  if (!d.medewerkerId) return uit;
  if (p.verlof.some((v) => v.medewerkerId === d.medewerkerId && v.status === "goedgekeurd" && v.van <= d.datum && d.datum <= v.tot)) uit.push("verlof");
  if (p.nietBeschikbaar.some((n) => n.medewerkerId === d.medewerkerId && n.datum === d.datum)) uit.push("niet-beschikbaar");
  if (p.diensten.some((x) => x.id !== d.id && x.medewerkerId === d.medewerkerId && overlapt(x, d))) uit.push("overlap");
  return uit;
}

// ---- overzichten -----------------------------------------------------------

export const dienstenVan = (p: Planning, medewerkerId: string, vanaf: string, dagen: number): Dienst[] =>
  p.diensten
    .filter((d) => d.medewerkerId === medewerkerId && d.datum >= vanaf && d.datum <= plusDagen(vanaf, dagen - 1))
    .sort((a, b) => (a.datum + a.van < b.datum + b.van ? -1 : 1));

export const openDiensten = (p: Planning, vanaf: string, dagen: number): Dienst[] =>
  p.diensten.filter((d) => d.medewerkerId === null && d.datum >= vanaf && d.datum <= plusDagen(vanaf, dagen - 1)).sort((a, b) => (a.datum + a.van < b.datum + b.van ? -1 : 1));

/** De geplande uren van een medewerker in een week, in minuten. */
export const weekMinuten = (p: Planning, medewerkerId: string, start: string): number =>
  p.diensten.filter((d) => d.medewerkerId === medewerkerId && d.datum >= start && d.datum <= plusDagen(start, 6)).reduce((s, d) => s + duurMinuten(d.van, d.tot), 0);

/** De gewerkte minuten van een afgeronde urenregel. */
export const werkMinuten = (u: Pick<Uur, "in" | "uit">): number => (u.uit === null ? 0 : duurMinuten(u.in, u.uit));

/** Uren per medewerker in een maand ("JJJJ-MM"), alleen afgeronde regels. */
export function urenPerMedewerker(p: Planning, maand: string): Map<string, number> {
  const uit = new Map<string, number>();
  for (const u of p.uren) if (u.datum.startsWith(maand) && u.uit !== null) uit.set(u.medewerkerId, (uit.get(u.medewerkerId) ?? 0) + werkMinuten(u));
  return uit;
}

/** De uren van een maand als csv voor de loonadministratie (puntkomma, komma als decimaalteken). */
export function urenCsv(p: Planning, maand: string, naam: (medewerkerId: string) => string): string {
  const regels = p.uren
    .filter((u) => u.datum.startsWith(maand))
    .sort((a, b) => (a.datum + a.in < b.datum + b.in ? -1 : 1))
    .map((u) => {
      const min = werkMinuten(u);
      return [naam(u.medewerkerId), u.datum, u.in, u.uit ?? "", u.uit === null ? "" : (min / 60).toFixed(2).replace(".", ",")].map(celVeilig).join(";");
    });
  return ["Medewerker;Datum;Van;Tot;Uren", ...regels].join("\r\n");
}

/** Een cel voor een csv: aanhalingstekens verdubbeld, en een formule (=, +, -, @) onschadelijk gemaakt voor een spreadsheet. */
export function celVeilig(s: string): string {
  const t = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
