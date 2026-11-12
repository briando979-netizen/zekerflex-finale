// Een adres op een domein dat voor tests en documentatie gereserveerd is (.test, .example, .invalid, localhost):
// geen mailserver bezorgt het. Puur bestand, zodat ook code zonder de hele mailmodule (bijv. lib/onboarding/verify.ts)
// een testaccount herkent. lib/mail exporteert dezelfde functie.

/** An address on a domain reserved for tests and documentation, which no mail server delivers. */
export function isReservedTestAddress(address: string): boolean {
  return /@(?:[^@\s]+\.)?(?:[^@\s.]+)\.(test|example|invalid|localhost)$/i.test(address.trim()) || /@localhost$/i.test(address.trim());
}

/**
 * Ging een bezorging echt mis? Alleen als de mailserver het probeerde (transport "smtp") en het niet lukte. Een testadres
 * of een afmelding blijft bewust in de eigen postbus (transport "mailbox"): dat is geen fout voor het foutenlogboek
 * (12 nov: elke aanmelding met een .test-adres gaf "verificatiemail niet afgeleverd").
 */
export function bezorgingMislukt<T extends { delivered: boolean; transport: "smtp" | "mailbox" }>(r: T | null | undefined): r is T {
  return Boolean(r && r.transport === "smtp" && !r.delivered);
}
