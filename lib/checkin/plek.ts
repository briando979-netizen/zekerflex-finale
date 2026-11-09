// Puur hulpje (geen imports, ook in de browser): mag de laatst bekende plek van de
// telefoon gelden voor een in-/uitcheck? Zonder bereik (kelder, koelcel) is er vaak
// ook geen verse GPS-meting; de plek van bij binnenkomst is dan het beste bewijs.
// Alleen zonder internet (dan krijgt de tik bron "offline" en altijd een signaal voor
// de opdrachtgever, lib/fraud/timesheet.ts) en hoogstens 5 minuten oud. Met internet
// telt alleen een verse meting, zodat niemand met een oude plek kan uitchecken.

export const LAATST_BEKEND_MAX_MS = 5 * 60_000;
/** Klokverschil tussen GPS-tijd en telefoonklok dat we nog accepteren. */
const KLOK_MARGE_MS = 60_000;

export function laatstBekendBruikbaar(plekTijd: number, nu: number, online: boolean): boolean {
  if (online || !Number.isFinite(plekTijd)) return false;
  const ouderdom = nu - plekTijd;
  return ouderdom >= -KLOK_MARGE_MS && ouderdom <= LAATST_BEKEND_MAX_MS;
}
