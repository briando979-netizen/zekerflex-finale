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
  } else if (s.soort) {
    if (!s.fiscaalIngevuld || !s.bedrijfOk) mist.push("btw");
  }
  if (!s.postcodeOk) mist.push("postcode");
  return mist;
}
