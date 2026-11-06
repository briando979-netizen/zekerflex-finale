// ---------------------------------------------------------------------------
// Eigen reserveringsagenda voor het Schwarzwald-voorstel (in plaats van de
// link naar Stackbase). Pure regels, zonder database, zodat ze los te testen
// zijn: wanneer is het open, welke tijdsloten zijn er, hoeveel plek is er nog
// en wat kost het ongeveer. Opslag van boekingen: schwarzwald-boekingen.ts.
//
// Openingstijden en minimale groepen komen van hetschwarzwald.nl. Capaciteit
// is alleen bekend voor buggy (30 tweepersoons buggy's), escaperoom (50
// spelers) en F1 (10 stoelen); de rest is een aanname die Het Schwarzwald zelf
// moet invullen. Daarom tonen we bezoekers nooit het exacte aantal plekken.
// ---------------------------------------------------------------------------

import type { Activiteit } from "@/lib/voorstel/schwarzwald";

export interface AgendaRegel {
  duurMin: number;
  /** maximaal aantal deelnemers tegelijk */
  capaciteit: number;
  /** minimale groep */
  min: number;
  /** maximale groep in één boeking */
  max: number;
  /** prijsindicatie per persoon; zondag-tarief waar ze dat hebben */
  prijsPP?: number;
  prijsPPZondag?: number;
  /** escaperoom: prijs per room van maximaal `perRoom` spelers */
  prijsPerRoom?: { prijs: number; perRoom: number };
}

// Slug -> regels. Anti-slipcursus ontbreekt bewust: die heeft vaste data op
// een andere locatie (Hellendoorn) en gaat via het aanvraagformulier.
export const AGENDA: Record<string, AgendaRegel> = {
  "buggy-rijden": { duurMin: 60, capaciteit: 60, min: 8, max: 60, prijsPP: 65, prijsPPZondag: 60 },
  "quad-rijden": { duurMin: 30, capaciteit: 40, min: 4, max: 40, prijsPP: 60 },
  "4x4-off-road": { duurMin: 60, capaciteit: 30, min: 10, max: 30, prijsPP: 60 },
  "e-chopper-tour": { duurMin: 60, capaciteit: 20, min: 8, max: 20, prijsPP: 35 },
  "solex-rijden": { duurMin: 60, capaciteit: 20, min: 8, max: 20, prijsPP: 35 },
  "retro-scooter-tour": { duurMin: 60, capaciteit: 20, min: 8, max: 20, prijsPP: 35 },
  "kever-rally": { duurMin: 90, capaciteit: 24, min: 8, max: 24, prijsPP: 35 },
  "swing-trike": { duurMin: 60, capaciteit: 16, min: 8, max: 16, prijsPP: 35 },
  "segway-clinic": { duurMin: 60, capaciteit: 20, min: 8, max: 20, prijsPP: 25 },
  "shooting-games": { duurMin: 60, capaciteit: 30, min: 8, max: 30 },
  escaperoom: { duurMin: 60, capaciteit: 50, min: 2, max: 50, prijsPerRoom: { prijs: 125, perRoom: 10 } },
  "f1-sim-race": { duurMin: 60, capaciteit: 10, min: 1, max: 10 },
};

/** Welke regels gelden: standaard, of zoals de beheerder ze heeft ingesteld (schwarzwald-instellingen.ts). */
export interface AgendaConfig {
  /** alleen activiteiten die online te boeken zijn */
  regels: Record<string, AgendaRegel>;
  /** weekdag (0 = zondag) -> open van/tot in minuten na middernacht, of null = dicht */
  open: Record<number, { van: number; tot: number } | null>;
  /** extra gesloten datums (feestdagen, besloten feest) */
  gesloten: string[];
  /** een deel van een dag niet online te boeken (per activiteit of alles) */
  blokkades?: Blokkade[] | undefined;
}

/** Een activiteit (of alles) een deel van een dag dicht voor online boeken: besloten feest, onderhoud. */
export interface Blokkade {
  datum: string;
  /** "HH:MM" */
  van: string;
  tot: string;
  /** slug van de activiteit, of "" = alle activiteiten */
  activiteit: string;
  reden: string;
}

export const boekbaar = (a: Activiteit, cfg: AgendaConfig = STANDAARD) => Object.prototype.hasOwnProperty.call(cfg.regels, a.slug);

/** Op ma en di alleen open voor groepen vanaf dit aantal, op reservering. */
export const GROEP_ANDERE_DAGEN = 12;
/** Zo ver vooruit kun je online boeken. */
export const VOORUIT_DAGEN = 180;

// Weekdag (0 = zondag) -> openingstijden in minuten na middernacht
export const STANDAARD_OPEN: Record<number, { van: number; tot: number } | null> = {
  0: { van: 11 * 60, tot: 22 * 60 + 30 },
  1: null,
  2: null,
  3: { van: 13 * 60, tot: 22 * 60 + 30 },
  4: { van: 13 * 60, tot: 22 * 60 + 30 },
  5: { van: 13 * 60, tot: 22 * 60 + 30 },
  6: { van: 11 * 60, tot: 22 * 60 + 30 },
};
// Ma/di voor grote groepen: zelfde tijden als doordeweeks
const OPEN_GROEP = { van: 13 * 60, tot: 22 * 60 + 30 };

export const STANDAARD: AgendaConfig = { regels: AGENDA, open: STANDAARD_OPEN, gesloten: [] };

// ook de dag zelf moet bestaan: "2026-02-30" parset als 2 maart en gaf een verkeerde kop
export const isDatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const isTijd = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function weekdag(datum: string): number {
  return new Date(`${datum}T00:00:00Z`).getUTCDay();
}

export function plusDagen(datum: string, n: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const minuten = (tijd: string) => Number(tijd.slice(0, 2)) * 60 + Number(tijd.slice(3, 5));
export const klok = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Openingstijden op een datum voor een groep van deze grootte, of null als dicht. */
export function openOp(datum: string, personen: number, cfg: AgendaConfig = STANDAARD): { van: number; tot: number } | null {
  if (cfg.gesloten.includes(datum)) return null;
  const open = cfg.open[weekdag(datum)] ?? null;
  if (open) return open;
  return personen >= GROEP_ANDERE_DAGEN ? OPEN_GROEP : null;
}

/** Valt de datum binnen het boekbare venster (vanaf morgen tot VOORUIT_DAGEN)? */
export function inVenster(datum: string, vandaag: string): boolean {
  return datum > vandaag && datum <= plusDagen(vandaag, VOORUIT_DAGEN);
}

export interface BezetteTijd {
  activiteit: string;
  tijd: string;
  personen: number;
}

export type SlotStatus = "vrij" | "bijna-vol" | "vol";

export interface Slot {
  tijd: string;
  status: SlotStatus;
  /** alleen server-side gebruiken (controle bij boeken), niet tonen */
  plek: number;
}

/** Tijdsloten (ieder heel uur) waarop de activiteit kan beginnen, met wat er nog vrij is. */
export function tijdsloten(slug: string, datum: string, personen: number, bezet: BezetteTijd[], cfg: AgendaConfig = STANDAARD): Slot[] {
  const regel = cfg.regels[slug];
  const open = openOp(datum, personen, cfg);
  if (!regel || !open) return [];
  const eigen = bezet.filter((b) => b.activiteit === slug && isTijd(b.tijd));
  const blokkades = (cfg.blokkades ?? []).filter((k) => k.datum === datum && (!k.activiteit || k.activiteit === slug));
  const sloten: Slot[] = [];
  for (let start = Math.ceil(open.van / 60) * 60; start + regel.duurMin <= open.tot; start += 60) {
    const eind = start + regel.duurMin;
    // alles wat met dit slot overlapt telt mee
    const bezetNu = eigen
      .filter((b) => {
        const s = minuten(b.tijd);
        return s < eind && s + regel.duurMin > start;
      })
      .reduce((som, b) => som + b.personen, 0);
    // een blokkade die het slot raakt maakt het vol
    const dicht = blokkades.some((k) => minuten(k.van) < eind && minuten(k.tot) > start);
    const plek = dicht ? 0 : Math.max(0, regel.capaciteit - bezetNu);
    const status: SlotStatus = plek < personen ? "vol" : plek - personen < regel.capaciteit * 0.25 ? "bijna-vol" : "vrij";
    sloten.push({ tijd: klok(start), status, plek });
  }
  return sloten;
}

export type DagStatus = "verleden" | "gesloten" | "vrij" | "vol";

export function dagStatus(slug: string, datum: string, personen: number, vandaag: string, bezet: BezetteTijd[], cfg: AgendaConfig = STANDAARD): DagStatus {
  if (!inVenster(datum, vandaag)) return "verleden";
  if (!openOp(datum, personen, cfg)) return "gesloten";
  return tijdsloten(slug, datum, personen, bezet, cfg).some((s) => s.status !== "vol") ? "vrij" : "vol";
}

/**
 * De eerstvolgende dagen (vanaf morgen, hooguit `zoek` dagen vooruit) waarop
 * deze activiteit voor deze groep nog een tijdslot vrij heeft.
 */
export function eerstVrij(slug: string, personen: number, vandaag: string, bezetOp: (datum: string) => BezetteTijd[], cfg: AgendaConfig = STANDAARD, aantal = 5, zoek = 60): string[] {
  const uit: string[] = [];
  for (let i = 1; i <= zoek && uit.length < aantal; i++) {
    const d = plusDagen(vandaag, i);
    if (dagStatus(slug, d, personen, vandaag, bezetOp(d), cfg) === "vrij") uit.push(d);
  }
  return uit;
}

/** Standaard groepsgrootte in de agenda: 8, binnen de grenzen van de activiteit. */
export const standaardGroep = (slug: string, cfg: AgendaConfig = STANDAARD) => {
  const r = cfg.regels[slug];
  return r ? Math.min(r.max, Math.max(r.min, 8)) : 8;
};

/** Prijsindicatie in hele euro's, of null als er geen vaste prijs per persoon is. */
export function prijsIndicatie(slug: string, personen: number, datum: string, cfg: AgendaConfig = STANDAARD): number | null {
  const regel = cfg.regels[slug];
  if (!regel) return null;
  if (regel.prijsPerRoom) return Math.ceil(personen / regel.prijsPerRoom.perRoom) * regel.prijsPerRoom.prijs;
  if (regel.prijsPP === undefined) return null;
  const pp = weekdag(datum) === 0 && regel.prijsPPZondag !== undefined ? regel.prijsPPZondag : regel.prijsPP;
  return pp * personen;
}

/** Waarom deze groep niet kan boeken, of null als het past. */
export function groepFout(slug: string, personen: number, cfg: AgendaConfig = STANDAARD): string | null {
  const regel = cfg.regels[slug];
  if (!regel) return "Deze activiteit is niet online te boeken.";
  if (!Number.isInteger(personen) || personen < regel.min) return `Minimaal ${regel.min} personen.`;
  if (personen > regel.max) return `Online maximaal ${regel.max} personen; bel ons voor grotere groepen.`;
  return null;
}

/**
 * Waarom een gast zijn eigen reservering niet zo kan wijzigen (andere dag,
 * tijd en/of aantal), of null als het kan. `bezet` = de andere boekingen op
 * de nieuwe dag, zonder deze boeking zelf.
 */
export function wijzigFout(
  b: { activiteit: string; datum: string; tijd: string; personen: number; status: string },
  naar: { datum: string; tijd: string; personen: number },
  vandaag: string,
  bezet: BezetteTijd[],
  cfg: AgendaConfig = STANDAARD,
): string | null {
  if (b.status === "geannuleerd") return "Deze reservering is geannuleerd.";
  if (b.datum <= vandaag) return "Wijzigen kan tot de dag ervoor. Bel ons voor vandaag.";
  if (!isDatum(naar.datum) || !isTijd(naar.tijd)) return "Kies een geldige datum en tijd.";
  if (naar.datum === b.datum && naar.tijd === b.tijd && naar.personen === b.personen) return "Er is niets gewijzigd.";
  if (!inVenster(naar.datum, vandaag)) return "Deze datum is niet (meer) te boeken.";
  return groepFout(b.activiteit, naar.personen, cfg) ?? slotFout(b.activiteit, naar.datum, naar.tijd, naar.personen, bezet, cfg);
}

/** Waarom deze activiteit niet op die dag en dat tijdstip kan (boeken of verzetten), of null als het kan. */
export function slotFout(slug: string, datum: string, tijd: string, personen: number, bezet: BezetteTijd[], cfg: AgendaConfig = STANDAARD): string | null {
  if (!openOp(datum, personen, cfg)) return "Op deze dag zijn we gesloten. Op maandag en dinsdag alleen voor groepen vanaf 12 personen.";
  const slot = tijdsloten(slug, datum, personen, bezet, cfg).find((s) => s.tijd === tijd);
  if (!slot) return "Op dit tijdstip kan deze activiteit niet beginnen.";
  if (slot.status === "vol") return "Dit tijdslot is net vol geraakt. Kies een ander tijdstip.";
  return null;
}
