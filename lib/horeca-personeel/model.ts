// ---------------------------------------------------------------------------
// Eigen personeel van een horecazaak (15 nov 2026): de beheerder (opdrachtgever) nodigt medewerkers uit, die zelf een account
// maken, en stelt per rol een eigen dashboard samen (welke onderdelen die medewerkers zien). Dit bestand: de vorm van de
// gegevens en de grenzen. Puur, zonder zod, opslag of klok, zodat de browser het mag importeren. Het inlezen met controle staat
// in schema.ts, het bewaren in store.ts, alle tekst (Nederlands en Engels) in teksten.ts. Geen tekst die een bezoeker leest.
// ---------------------------------------------------------------------------

/** Onderdelen die een medewerker op zijn dashboard kan zien; de beheerder kiest per dashboard welke. */
export const BLOKKEN = ["taken", "mededelingen", "rooster", "verlof", "uren", "loonstroken", "berichten"] as const;
export type Blok = (typeof BLOKKEN)[number];

/** Welke onderdelen al werken; een onderdeel dat nog niet klaar is, laat het beheer zien als "binnenkort" en de server weigert het. */
export const BLOK_KLAAR: Readonly<Record<Blok, boolean>> = { taken: true, mededelingen: true, rooster: true, verlof: true, uren: true, loonstroken: true, berichten: true };

export const MEDEWERKER_STATUSSEN = ["uitgenodigd", "actief", "gestopt"] as const;
export type MedewerkerStatus = (typeof MEDEWERKER_STATUSSEN)[number];

export const MAX_DASHBOARDS = 12;
export const MAX_MEDEWERKERS = 200;
export const MAX_MEDEDELINGEN = 30;
export const MAX_TEKST = 600;
/** een uitnodiging blijft zo lang geldig (dagen) */
export const UITNODIGING_DAGEN = 14;

export interface PersoneelsDashboard {
  id: string;
  naam: string;
  blokken: Blok[];
}

export interface Medewerker {
  id: string;
  naam: string;
  email: string;
  /** vrije tekst, bijvoorbeeld "bediening" of "souschef" */
  functie: string;
  dashboardId: string;
  status: MedewerkerStatus;
  /** het account, pas ingevuld als de uitnodiging is gebruikt */
  userId: string | null;
  uitgenodigd: string;
}

export interface Mededeling {
  id: string;
  tekst: string;
  /** ISO-tijdstip */
  datum: string;
  /** leeg = voor alle medewerkers */
  dashboardIds: string[];
  /** de medewerkers (ids) die de mededeling hebben gezien */
  gelezen: string[];
}

export interface PersoneelData {
  versie: 1;
  dashboards: PersoneelsDashboard[];
  medewerkers: Medewerker[];
  mededelingen: Mededeling[];
}

export const leegPersoneel = (): PersoneelData => ({ versie: 1, dashboards: [], medewerkers: [], mededelingen: [] });

/** Een nieuw id dat nog niet bestaat: voorvoegsel plus het laagste vrije nummer. */
export function volgendeId(voorvoegsel: string, bestaand: readonly { id: string }[]): string {
  const gebruikt = new Set(bestaand.map((x) => x.id));
  for (let n = 1; n < 10_000; n += 1) if (!gebruikt.has(`${voorvoegsel}${n}`)) return `${voorvoegsel}${n}`;
  return `${voorvoegsel}${bestaand.length + 1}`;
}

/** Alleen onderdelen die bestaan en al werken, zonder dubbelen, in de vaste volgorde van BLOKKEN. */
export function schoneBlokken(ruw: readonly string[]): Blok[] {
  return BLOKKEN.filter((b) => BLOK_KLAAR[b] && ruw.includes(b));
}

/** Een e-mailadres zoals we het bewaren: kleine letters, zonder spaties. */
export const schoonEmail = (e: string): string => e.trim().toLowerCase();

export const dashboardVan = (d: PersoneelData, id: string): PersoneelsDashboard | undefined => d.dashboards.find((x) => x.id === id);

/** De mededelingen die een medewerker met dit dashboard ziet, nieuwste eerst. */
export function mededelingenVoor(d: PersoneelData, dashboardId: string): Mededeling[] {
  return d.mededelingen
    .filter((m) => m.dashboardIds.length === 0 || m.dashboardIds.includes(dashboardId))
    .slice()
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));
}
