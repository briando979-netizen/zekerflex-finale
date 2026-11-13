// ---------------------------------------------------------------------------
// Wat er nog mist in de stap "gegevens" van de werker-onboarding, per onderdeel (12 nov 2026). De poort zegt alleen
// "gegevens ingevuld ja/nee" (lib/onboarding/werker-poort-server.ts); een werker moet weten WAT er mist en waar hij dat invult.
// Gemeten bij de nieuwe werkers: 19 van de 20 bleven bij "gegevens" hangen, en van de 16 uitzendkrachten die daar stilstonden
// ontbrak bij ALLEN het BSN, terwijl er op /dashboard/verificatie (waar de stap naartoe wijst) geen BSN-veld stond: dat zat alleen
// op /dashboard/fiscaal, waar maar 2 van de 23 ooit kwamen.
// Puur (geen prisma, geen kv): de pagina levert de feiten; dezelfde regel als de poort, zodat de lijst leeg is precies wanneer
// de poort "gegevens ingevuld" zegt (het IBAN hoort er sinds 10 nov niet meer bij: dat komt vóór de eerste betaalde klus).
// Sinds 13 nov hoort ook het BSN met de uitzendovereenkomst niet meer bij de aanmelding (eigenaar, na de meting: 11 van de 16
// uitzendkrachten bleven op het BSN hangen); die staan in voorEersteKlus, met het veld en de overeenkomst onder "Later".
// ---------------------------------------------------------------------------

export type GegevensStuk = "bsn" | "contract" | "btw" | "postcode";

export interface GegevensStand {
  soort: "zzp" | "flexwerker" | "uitzendkracht" | null;
  /** fiscaalIngevuld(fiscal): bij een uitzendkracht het BSN, bij een zzp'er/flexwerker btw of KOR (lib/fiscal/store.ts) */
  fiscaalIngevuld: boolean;
  /** de getekende, geldende uitzendovereenkomst (alleen bij een uitzendkracht van belang) */
  contractGetekend: boolean;
  /** een geldig of ingevuld KVK-nummer, een geldig btw-nummer of de KOR (niet-uitzendkracht) */
  bedrijfOk: boolean;
  /** thuisbasis (postcode) ingevuld */
  postcodeOk: boolean;
}

/** Wat er nog mist, in de volgorde waarin een werker het doet; leeg = de gegevens zijn ingevuld. */
export function gegevensMist(s: GegevensStand): GegevensStuk[] {
  // KVK/btw/KOR (zzp'er, flexwerker; 86) en het BSN met de overeenkomst (uitzendkracht) horen sinds 13 nov niet meer bij de
  // aanmelding: zie voorEersteKlus
  return s.postcodeOk ? [] : ["postcode"];
}

/**
 * Wat een werker nog moet invullen vóór zijn eerste klus, maar niet voor de aanmelding (13 nov): een zzp'er of flexwerker
 * btw, KVK of KOR; een uitzendkracht het BSN (loonadministratie) en de getekende uitzendovereenkomst. Reageren houdt het
 * tegen (lib/fiscal/eligibility.ts), met een eerlijke reden.
 */
export function voorEersteKlus(s: GegevensStand): GegevensStuk[] {
  if (s.soort === "zzp" || s.soort === "flexwerker") return s.fiscaalIngevuld && s.bedrijfOk ? [] : ["btw"];
  if (s.soort !== "uitzendkracht") return [];
  const later: GegevensStuk[] = [];
  if (!s.fiscaalIngevuld) later.push("bsn");
  if (!s.contractGetekend) later.push("contract");
  return later;
}

/**
 * Heeft het formulier van /dashboard/verificatie niets meer te vragen? Persoon, thuisbasis en ID af en geen gegevens die
 * missen: dan toont de pagina het eindscherm, ook als het profiel nog niet "compleet" is (het rekeningnummer hoort niet bij
 * de aanmelding). Zonder deze regel bleef zo'n werker in het formulier hangen (13 nov).
 */
export function aanmeldingAf(f: { persoonKlaar: boolean; woonKlaar: boolean; idKlaar: boolean; mist: readonly GegevensStuk[] }): boolean {
  return f.persoonKlaar && f.woonKlaar && f.idKlaar && f.mist.length === 0;
}
