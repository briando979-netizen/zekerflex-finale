// Een adres op een domein dat voor tests en documentatie gereserveerd is (.test, .example, .invalid, localhost):
// geen mailserver bezorgt het. Puur bestand, zodat ook code zonder de hele mailmodule (bijv. lib/onboarding/verify.ts)
// een testaccount herkent. lib/mail exporteert dezelfde functie.

/** An address on a domain reserved for tests and documentation, which no mail server delivers. */
export function isReservedTestAddress(address: string): boolean {
  return /@(?:[^@\s]+\.)?(?:[^@\s.]+)\.(test|example|invalid|localhost)$/i.test(address.trim()) || /@localhost$/i.test(address.trim());
}
