import type { OproepSoort } from "@/lib/horeca/zaal";

// Korte teksten die dashboard en schermen delen (puur, ook in de browser).

export const OPROEP_TEKST: Record<OproepSoort, string> = { ober: "Ober", rekening: "Rekening" };
export const OPROEP_LANG: Record<OproepSoort, string> = { ober: "roept de ober", rekening: "wil afrekenen" };

export const RES_STATUS: Record<string, string> = { BEVESTIGD: "Verwacht", AANGEKOMEN: "Binnen", NIET_GEKOMEN: "Niet gekomen", GEANNULEERD: "Geannuleerd" };

/** "19:00" → minuten tot of sinds die tijd vandaag, als korte tekst. */
export function tijdTot(tijd: string, nuMin: number): string {
  const m = Number(tijd.slice(0, 2)) * 60 + Number(tijd.slice(3, 5)) - nuMin;
  if (m > 90) return `om ${tijd}`;
  if (m > 0) return `over ${m} min`;
  if (m === 0) return "nu";
  return `${-m} min te laat`;
}
