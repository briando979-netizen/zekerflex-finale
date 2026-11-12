// ---------------------------------------------------------------------------
// Persoonsgegevens uit een vraag of antwoord halen vóór het wordt bewaard (12 nov 2026, privacygat in lib/learn/store.ts: de
// vragen van de openbare chat stonden volledig in een gedeelde lijst). Puur: geen kv, geen prisma. Een mens typt in zo'n chat
// vaak zijn eigen e-mailadres of telefoonnummer; dat hoort niet 90 dagen in een leerlijst. Liever te veel dan te weinig weg:
// de vraag blijft bruikbaar als voorbeeld, het nummer niet.
// ---------------------------------------------------------------------------

const MAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// NL-rekeningnummer en IBAN van andere landen: twee letters, twee cijfers, dan groepen van vier
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/gi;
// met landcode: +31 6 12345678, +31612345678, 0031 6 1234 5678
const TEL_INTERNATIONAAL = /(?:\+|\b00)\d{1,3}[\s-]?\(?\d{1,4}\)?(?:[\s-]?\d){6,11}/g;
// binnenlands: 06 12345678, 06-1234 5678, 020 1234567, 0612345678 (minstens tien cijfers, dus geen KVK- of postcode)
const TEL_NATIONAAL = /\b0\d{1,2}[\s-]?(?:\d[\s-]?){7,9}\d\b/g;
// "mijn BSN is 123456782" (een paar woorden of tekens tussen BSN en het nummer)
const BSN = /\bBSN\b\D{0,12}\d{8,9}\b/gi;

export const WEG = {
  mail: "[e-mailadres]",
  iban: "[rekeningnummer]",
  tel: "[telefoonnummer]",
  bsn: "[BSN]",
} as const;

/** De tekst zonder e-mailadressen, telefoonnummers, rekeningnummers en BSN's. */
export function schoonPersoonsgegevens(tekst: string): string {
  return tekst
    .replace(MAIL, WEG.mail)
    .replace(BSN, WEG.bsn)
    .replace(IBAN, WEG.iban)
    .replace(TEL_INTERNATIONAAL, WEG.tel)
    .replace(TEL_NATIONAAL, WEG.tel);
}
