// Een adres op een domein dat voor tests en documentatie gereserveerd is (.test, .example, .invalid, localhost):
// geen mailserver bezorgt het. Puur bestand, zodat ook code zonder de hele mailmodule (bijv. lib/onboarding/verify.ts)
// een testaccount herkent. lib/mail exporteert dezelfde functie.

/** An address on a domain reserved for tests and documentation, which no mail server delivers. */
export function isReservedTestAddress(address: string): boolean {
  return /@(?:[^@\s]+\.)?(?:[^@\s.]+)\.(test|example|invalid|localhost)$/i.test(address.trim()) || /@localhost$/i.test(address.trim());
}

/**
 * Ging een bezorging echt mis? Niet bezorgd is een fout voor het foutenlogboek, behalve bij een testadres (dat gaat bewust
 * nooit naar de mailserver; 12 nov gaf elke aanmelding met een .test-adres "verificatiemail niet afgeleverd") en bij een
 * afmelding. Let op: zonder SMTP-instellingen blijft ook een echte mail in de eigen postbus; die moet juist wél gemeld worden.
 */
export function bezorgingMislukt<T extends { delivered: boolean; suppressed?: string | undefined }>(r: T | null | undefined, aan: string): r is T {
  if (!r || r.delivered || r.suppressed) return false;
  return !isReservedTestAddress(aan);
}
