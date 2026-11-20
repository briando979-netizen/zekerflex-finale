// Initialen voor het rondje zonder profielfoto (profiel, chat). Puur: geen React, geen server.
//
// 20 nov 2026: de oude regel nam het eerste teken van de eerste twee woorden, wat het ook was. De naam
// "Rondgang (controle)" gaf zo "R(" en "Jan - Peter" gaf "J-". Nu telt alleen een letter: van elk woord de
// eerste letter, en een woord zonder letters ("-", "&", "(2)") doet niet mee. Gewone namen blijven gelijk
// ("Jan de Vries" → "JD", "shalomi" → "S").
//
// Geen lookbehind (Safari vóór 16.4 valt daarop om, tests/regex-safari.test.ts); \p{L} met de u-vlag kan overal.

const LETTER = /\p{L}/u;
const LETTER_OF_CIJFER = /[\p{L}\p{N}]/u;

/** De eerste letter van de eerste twee woorden met een letter, in hoofdletters. Geen letters: het eerste cijfer; anders leeg. */
export function naamInitialen(naam: string | null | undefined): string {
  const woorden = (naam ?? "").split(/\s+/).filter(Boolean);
  const letters: string[] = [];
  for (const woord of woorden) {
    const letter = LETTER.exec(woord)?.[0];
    if (letter) letters.push(letter.toUpperCase());
    if (letters.length === 2) break;
  }
  if (letters.length > 0) return letters.join("");
  // een naam zonder één letter ("24/7"): liever een cijfer dan een leeg rondje
  for (const woord of woorden) {
    const teken = LETTER_OF_CIJFER.exec(woord)?.[0];
    if (teken) return teken;
  }
  return "";
}
