// ---------------------------------------------------------------------------
// Status in de chat (15 nov 2026), zoals de status in WhatsApp: een tekst of foto die 24 uur zichtbaar is voor je
// contacten. Puur (geen opslag): de vaste regels en de vorm die de browser krijgt. Opslag en wie wat mag zien:
// lib/messaging/status.ts.
// ---------------------------------------------------------------------------

/** Zo lang blijft een status staan. */
export const STATUS_DUUR_MS = 24 * 60 * 60 * 1000;
/** Hooguit zoveel tegelijk per persoon. */
export const STATUS_MAX_PER_PERSOON = 30;
export const STATUS_TEKST_MAX = 700;
/** Foto's: alleen wat we opnieuw kunnen opslaan zonder GPS en andere gegevens (cleanPhoto). */
export const STATUS_FOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const STATUS_FOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Achtergronden voor een tekststatus; witte tekst haalt op elk ervan AA. */
export const STATUS_KLEUREN = ["#0E5C4A", "#1E40AF", "#5B21B6", "#9D174D", "#7C4A03", "#334155"] as const;

export function statusKleur(i: number | undefined): string {
  return STATUS_KLEUREN[i ?? 0] ?? STATUS_KLEUREN[0];
}

/** Een status zoals een kijker hem krijgt: zonder wie hem verder zag. */
export interface StatusKaart {
  id: string;
  soort: "tekst" | "foto";
  tekst?: string;
  kleur?: number;
  at: string;
  tot: string;
  /** de kijker zag hem al */
  gezien: boolean;
}

/** Je eigen status: met wie hem zag (userId → tijd). */
export interface EigenStatus extends Omit<StatusKaart, "gezien"> {
  gezienDoor: Record<string, string>;
}

export interface StatusFeed {
  mijn: EigenStatus[];
  anderen: { userId: string; naam: string; statussen: StatusKaart[] }[];
  /** namen van wie jouw status zag */
  namen: Record<string, string>;
}

/** Hoe lang geleden: zojuist (< 1 min), in minuten (< 1 uur) of in hele uren. */
export function hoeLangGeleden(iso: string, nu = Date.now()): { soort: "zojuist" } | { soort: "min" | "uur"; n: number } {
  const min = Math.floor((nu - new Date(iso).getTime()) / 60_000);
  if (min < 1) return { soort: "zojuist" };
  if (min < 60) return { soort: "min", n: min };
  return { soort: "uur", n: Math.floor(min / 60) };
}
