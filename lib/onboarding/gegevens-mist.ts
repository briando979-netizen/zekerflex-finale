// ---------------------------------------------------------------------------
// Wat er nog mist in de stap "gegevens" van de werker-onboarding, per onderdeel (12 nov 2026). De poort zegt alleen
// "gegevens ingevuld ja/nee" (lib/onboarding/werker-poort-server.ts); een werker moet weten WAT er mist en waar hij dat invult.
// Gemeten bij de nieuwe werkers: 19 van de 20 bleven bij "gegevens" hangen, en van de 16 uitzendkrachten die daar stilstonden
// ontbrak bij ALLEN het BSN, terwijl er op /dashboard/verificatie (waar de stap naartoe wijst) geen BSN-veld stond: dat zat alleen
// op /dashboard/fiscaal, waar maar 2 van de 23 ooit kwamen.
// Puur (geen prisma, geen kv): de pagina levert de feiten; dezelfde regel als de poort, zodat de lijst leeg is precies wanneer
// de poort "gegevens ingevuld" zegt (het IBAN hoort er sinds 10 nov niet meer bij: dat komt vóór de eerste betaalde klus).
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
  const mist: GegevensStuk[] = [];
  if (s.soort === "uitzendkracht") {
    if (!s.fiscaalIngevuld) mist.push("bsn");
    if (!s.contractGetekend) mist.push("contract");
  }
  // een zzp'er of flexwerker: KVK/btw/KOR hoort sinds 13 nov niet meer bij de aanmelding (86), zie voorEersteKlus
  if (!s.postcodeOk) mist.push("postcode");
  return mist;
}

/**
 * Wat een zzp'er of flexwerker nog moet invullen vóór zijn eerste klus, maar niet voor de aanmelding (13 nov): btw, KVK
 * of KOR. Reageren houdt het tegen (lib/fiscal/eligibility.ts), met een eerlijke reden als de KVK-controle nog wacht.
 */
export function voorEersteKlus(s: GegevensStand): GegevensStuk[] {
  return s.soort === "zzp" || s.soort === "flexwerker" ? (s.fiscaalIngevuld && s.bedrijfOk ? [] : ["btw"]) : [];
}

/**
 * Heeft het formulier van /dashboard/verificatie niets meer te vragen? Persoon, thuisbasis en ID af en geen gegevens die
 * missen: dan toont de pagina het eindscherm, ook als het profiel nog niet "compleet" is (het rekeningnummer hoort niet bij
 * de aanmelding). Zonder deze regel bleef zo'n werker in het formulier hangen (13 nov).
 */
export function aanmeldingAf(f: { persoonKlaar: boolean; woonKlaar: boolean; idKlaar: boolean; mist: readonly GegevensStuk[] }): boolean {
  return f.persoonKlaar && f.woonKlaar && f.idKlaar && f.mist.length === 0;
}
