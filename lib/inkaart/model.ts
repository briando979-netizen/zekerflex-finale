// ---------------------------------------------------------------------------
// "Bedrijf in kaart" (15 nov 2026): een bedrijf zet in een paar minuten zijn eigen cijfers neer (personeel, kosten, ruimtes en hoe vol die zijn),
// en ZekerFlex rekent daar uit wat eruit volgt: personeelskostenpercentage, hoeveel ruimtes je op het drukste moment echt nodig hebt, wanneer het
// druk en rustig is, en wat dat betekent voor de inrichting en de inzet van mensen. Dit bestand: de vorm van de gegevens, de grenzen en wat
// daarbij hoort. Puur en zonder zod, opslag of klok, zodat de browser het mag importeren. Het inlezen met controle staat in lib/inkaart/schema.ts,
// de berekeningen in lib/inkaart/analyse.ts, alle tekst (Nederlands en Engels) in lib/inkaart/teksten.ts. Dit bestand bevat dus geen tekst die een
// bezoeker leest. Alles komt van het bedrijf zelf; er zijn geen eigen "richtcijfers" van een branche: een vergelijking is met het eigen doel of
// met de eigen cijfers.
// ---------------------------------------------------------------------------

export const DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"] as const;
export type Dag = (typeof DAGEN)[number];

/** Elke dag in drie delen van zes uur (ochtend 6 tot 12, middag 12 tot 18, avond 18 tot 24); de raster-index is dag * 3 + deel. */
export const DAGDELEN = ["ochtend", "middag", "avond"] as const;
export type Dagdeel = (typeof DAGDELEN)[number];
export const UREN_PER_DAGDEEL = 6;
export const RASTER_LENGTE = DAGEN.length * DAGDELEN.length;

/** De dag (0 tot 6, maandag eerst) en het dagdeel (0 tot 2) bij een plek in het raster. */
export const dagVan = (index: number): number => Math.floor(index / DAGDELEN.length);
export const deelVan = (index: number): number => index % DAGDELEN.length;

export const MAX_RUIMTE_REGELS = 60;
export const MAX_GROEPEN = 40;
export const MAX_RUIMTES_PER_REGEL = 2000;

/** De soorten bedrijf waarvoor een voorbeeldset klaarstaat (lib/inkaart/sjablonen.ts); "overig" begint leeg. */
export const SOORTEN = ["ziekenhuis", "praktijk", "kantoor", "school", "horeca", "winkel", "hotel", "overig"] as const;
export type Soort = (typeof SOORTEN)[number];

/** procent bezet per dagdeel (RASTER_LENGTE waarden); null = niet ingevuld */
export type Raster = (number | null)[];

export interface Ruimte {
  id: string;
  naam: string;
  soort: string;
  /** hoeveel gelijke ruimtes dit er zijn (12 spreekkamers = één regel met aantal 12) */
  aantal: number;
  /** oppervlakte van één ruimte in m² */
  m2: number | null;
  /** hoeveel mensen er tegelijk in kunnen (stoelen, bedden, werkplekken) */
  plekken: number | null;
  afdeling: string;
  verdieping: string;
  bezetting: Raster;
  notitie: string;
}

export interface PersoneelGroep {
  id: string;
  naam: string;
  /** voltijdsequivalenten */
  fte: number;
  /** wat deze groep per jaar kost, werkgeverslasten inbegrepen; null = niet ingevuld */
  kostenJaar: number | null;
}

export interface BedrijfInKaart {
  versie: 1;
  bijgewerkt: string;
  soort: Soort;
  /** het jaar waar de cijfers over gaan */
  jaar: number;
  omzetJaar: number | null;
  /** alle personeelskosten samen, als je ze niet per groep weet */
  personeelskostenJaar: number | null;
  huurJaar: number | null;
  /** eigen doelen: waar vergelijken we mee? null = geen doel ingesteld */
  doelPersoneelPct: number | null;
  doelBezettingPct: number | null;
  /** wanneer het bedrijf open is of de ruimtes in gebruik zijn: RASTER_LENGTE waarden */
  open: boolean[];
  groepen: PersoneelGroep[];
  ruimtes: Ruimte[];
}

/** Een leeg raster (niets ingevuld). */
export const legeBezetting = (): Raster => Array.from({ length: RASTER_LENGTE }, () => null);

/** Standaard open: maandag tot en met vrijdag, ochtend en middag. */
export const standaardOpen = (): boolean[] => Array.from({ length: RASTER_LENGTE }, (_, i) => dagVan(i) < 5 && deelVan(i) < 2);

/** Een bedrijf zonder gegevens. `nu` geeft het jaar en het tijdstip; geen eigen klok, zodat dit in de browser kan. */
export function leegBedrijf(soort: Soort = "overig", nu: Date = new Date(0)): BedrijfInKaart {
  return {
    versie: 1,
    bijgewerkt: nu.toISOString(),
    soort,
    jaar: Math.max(2000, nu.getUTCFullYear()),
    omzetJaar: null,
    personeelskostenJaar: null,
    huurJaar: null,
    doelPersoneelPct: null,
    doelBezettingPct: null,
    open: standaardOpen(),
    groepen: [],
    ruimtes: [],
  };
}
