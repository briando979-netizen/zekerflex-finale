// Een telwoord met het juiste enkel- of meervoud ("1 taak", "2 taken", "0 taken"). Puur, dus ook bruikbaar in client-componenten.

/** "1 taak" / "2 taken" / "0 taken": het getal vóór het woord. */
export function aantalMet(n: number, enkelvoud: string, meervoud: string): string {
  return `${n} ${n === 1 ? enkelvoud : meervoud}`;
}
