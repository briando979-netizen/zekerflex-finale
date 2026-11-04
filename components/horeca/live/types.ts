import type { BestelRegel, BestelStatus } from "@/lib/horeca/bestellen";
import type { LiveCijfers, OproepSoort, TafelLive } from "@/lib/horeca/zaal";
import type { SchermRol } from "@/lib/horeca/schermen";

// Wat /api/horeca/scherm en /api/horeca/beheer?alleen=live teruggeven, zoals
// de browser het ziet (lib/horeca/live.ts). Los en puur, zodat schermen niets
// van de server meenemen.

export interface SchermBestelling {
  id: string;
  nummer: number;
  tafelId: string | null;
  tafelNaam: string | null;
  status: BestelStatus;
  regels: BestelRegel[];
  totaalCent: number;
  betaald: boolean;
  createdAt: string;
  opmerking: string;
  naam: string;
  bron: string;
}

export type ReserveringStatus = "BEVESTIGD" | "AANGEKOMEN" | "NIET_GEKOMEN" | "GEANNULEERD";

export interface SchermReservering {
  id: string;
  tafelId: string | null;
  tafelNaam: string | null;
  tijd: string;
  personen: number;
  naam: string;
  telefoon: string;
  opmerking: string;
  bron: string;
  status: ReserveringStatus;
}

export interface SchermItem {
  id: string;
  naam: string;
  prijsCent: number;
  beschikbaar: boolean;
  station: string;
  categorieId: string | null;
  allergenen: string[];
  vegetarisch: boolean;
}

export interface Oproep {
  tafelId: string;
  soort: OproepSoort;
  op: string;
  tafelNaam: string;
}

export interface Komend {
  id: string;
  tijd: string;
  personen: number;
  naam: string;
  tafelId: string | null;
}

export interface LiveBasis {
  nu: { datum: string; minuten: number; iso: string };
  tafels: { id: string; naam: string; plaatsen: number; zone: string }[];
  zaal: TafelLive[];
  cijfers: LiveCijfers;
  komend: Komend[];
  reserveringen: SchermReservering[];
  oproepen: Oproep[];
}

export interface ZaakKort {
  naam: string;
  slug: string;
  kleur: string;
  accent: string;
  modules: string[];
}

export interface BonKop {
  naam: string;
  adres: string;
  plaats: string;
  telefoon: string;
  kvk: string;
  btwNummer: string;
  voettekst: string;
}

export interface BonData {
  id: string;
  bonNummer: number | null;
  op: string;
  tafel: string | null;
  methode: string;
  bedragCent: number;
  fooiCent: number;
  regels: { naam: string; prijsCent: number; aantal: number; btw: number }[];
  door: string;
}

export interface SchermData extends Partial<LiveBasis> {
  rol: SchermRol;
  apparaat: { naam: string } | null;
  zaak: ZaakKort;
  bestellingen?: SchermBestelling[];
  items?: SchermItem[];
  categorieen?: { id: string; naam: string }[];
  afhaal?: { bereiding: number[]; klaar: number[] };
  /** kassa en bediening: wat er op de bon staat */
  bonKop?: BonKop;
  /** na afrekenen: de bonnen om te tonen of te printen */
  bonnen?: BonData[];
}

export interface ApparaatRij {
  id: string;
  naam: string;
  rol: SchermRol;
  gemaakt: string;
  gekoppeld: string | null;
  gezien: string | null;
}

export interface DashboardData extends LiveBasis {
  taken: { id: string; naam: string; moment: string; totaal: number; gedaan: number; buitenGrens: { taak: string; waarde: string }[] }[];
  uitverkocht: { id: string; naam: string }[];
  apparaten: ApparaatRij[];
}

/** Een apparaat dat de laatste 3 minuten iets vroeg, telt als "aan". */
export const isAan = (a: Pick<ApparaatRij, "gezien">, nu: number) => a.gezien !== null && nu - Date.parse(a.gezien) < 3 * 60_000;
