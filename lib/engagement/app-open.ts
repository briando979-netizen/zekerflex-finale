// Puur hulpje (geen imports, ook in de browser bruikbaar): hoe vaak de werker-app
// "ik ben open" meldt aan /api/engagement. De Behavioural Timing Notifier
// (lib/engagement/events.ts) leert uit die momenten op welke uren iemand echt
// bereikbaar is; zonder rem zou één middag heen en weer tikken de telling scheef
// trekken. Eén melding per half uur, in de app én op de server.

export const APP_OPEN_INTERVAL_MS = 30 * 60_000;

/** Telt een nieuwe "app geopend" mee? `vorige` = tijdstip (ms) van de laatste melding, of null. */
export function appOpenTelt(vorige: number | null, nu: number): boolean {
  if (vorige === null || !Number.isFinite(vorige)) return true;
  // klok teruggezet of rommel in de opslag: gewoon opnieuw tellen
  if (vorige > nu) return true;
  return nu - vorige >= APP_OPEN_INTERVAL_MS;
}
