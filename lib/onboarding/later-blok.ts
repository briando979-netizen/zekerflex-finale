// ---------------------------------------------------------------------------
// Het blok "Voor je eerste klus" op /dashboard/verificatie (BSN, btw/KOR, rekeningnummer, recht om te werken, de
// uitzendovereenkomst) stond al onder het formulier terwijl een werker nog met de vijf stappen van de aanmelding bezig was:
// te veel tegelijk (20 nov 2026). Het blok komt nu pas als die stappen af zijn; tot dan staat er één regel dat dit daarna
// komt. Puur bestand, alleen weergave: de regels zelf staan in lib/onboarding/werker-poort.ts (POORT_STAPPEN) en blijven
// zoals ze zijn. Reageren, uitbetalen en de herinneringen veranderen hier niet door.
// ---------------------------------------------------------------------------

import { poortStapVan, werkerOnboardingKlaar, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

/**
 * De ankers van het blok, waar mails, pushes en andere schermen naartoe linken (KLUS_STUK_HREF in klaar-voor-klus.ts,
 * MIST_HREF in herinnering-teksten.ts, de mail over de bijgewerkte uitzendovereenkomst). Is het blok nog verborgen, dan
 * staan ze bij de regel "dit komt daarna", zodat zo'n link niet op een lege plek uitkomt.
 */
export const LATER_ANKERS = ["gegevens-later-kop", "bankrekening", "werkrecht", "uitzendovereenkomst"] as const;

/**
 * Toont de pagina het blok "Voor je eerste klus"? Ja zodra de vijf stappen af zijn (werkerOnboardingKlaar). Zijn de feiten
 * er niet (storing), dan ook ja: liever het blok te vroeg dan iets wat een werker nodig heeft onbereikbaar.
 */
export function laterBlokTonen(poort: WerkerPoortFeiten | null): boolean {
  return !poort || werkerOnboardingKlaar(poort);
}

/**
 * Staat de eerstvolgende open stap ergens anders dan op het formulier van Verificatie (richting, branches en de foto staan
 * bovenaan Ontdekken)? Dan krijgt de regel een knop daarheen; gegevens en identiteit staan in het formulier erboven.
 */
export function stapStaatElders(poort: WerkerPoortFeiten | null): boolean {
  const stap = poort ? poortStapVan(poort) : null;
  return stap !== null && stap.sleutel !== "gegevens" && stap.sleutel !== "identiteit";
}
