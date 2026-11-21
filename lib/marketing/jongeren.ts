// Jongeren onder de 18 (21 nov 2026). Werken via ZekerFlex kan vanaf 18. Wie 16 of 17 is, kan op /nog-geen-18 een e-mailadres
// achterlaten (nieuwsbrief met dubbele bevestiging, eigen bron); de openbare assistent verwijst daarheen. Puur bestand.

/** De bron in de nieuwsbrief (lib/newsletter/store.ts, max 40 tekens): zo mail je deze groep apart. */
export const JONGEREN_BRON = "jongeren-16-17";

/** De tekst bij het vinkje: 16 of 17 jaar (zelf toestemming geven mag vanaf 16) en waarvoor we het adres gebruiken. */
export const JONGEREN_TOESTEMMING =
  "Ik ben 16 of 17 jaar en wil een bericht krijgen zodra ik via ZekerFlex aan de slag kan. Afmelden kan altijd.";

export const JONGEREN_PAD = "/nog-geen-18";

/** Het vaste antwoord van de assistent op een vraag over leeftijd. */
export const JONGEREN_ANTWOORD =
  "Werken via ZekerFlex kan vanaf 18 jaar. Ben je 16 of 17? Laat dan je e-mailadres achter op zekerflex.com/nog-geen-18, dan sturen we je een bericht zodra je bij ons aan de slag kunt. Ben je jonger dan 16, kom dan later gerust terug!";

/** Vragen over leeftijd of jonger dan 18 (de assistent antwoordt dan met JONGEREN_ANTWOORD). */
// "ik ben 16" of "16 jaar oud", maar niet "15 jaar ervaring"
export const JONGEREN_VRAAG = /\bik ben (nog maar )?(1[2-7])\b|\b(1[2-7]) ?(jaar|jr) oud\b|minderjarig|jonger dan (18|achttien)|onder de (18|achttien)|nog geen (18|achttien)|hoe oud moet|minimum ?leeftijd|minimale leeftijd|vanaf welke leeftijd|welke leeftijd/i;
