// ---------------------------------------------------------------------------
// "Laat weten wie je bent": de stappen van de werker-start als tijdlijn, en de
// stap die een werker nog mist als hij niet mag reageren. Puur bestand, alleen
// weergave-logica: de regels zelf staan in lib/onboarding/werker-poort.ts en op
// de server (lib/fiscal/eligibility.ts, lib/werkrecht).
// ---------------------------------------------------------------------------

import { POORT_STAPPEN } from "@/lib/onboarding/werker-poort";

export type TijdlijnSleutel = "kind" | "branches" | "email" | "gegevens" | "identiteit" | "foto" | "werkrecht" | "tweestap";

// De stappen van de tijdlijn zijn die van de poort (POORT_STAPPEN in werker-poort.ts): één lijst, één teller "stap n van 5".
// "email" is geen stap meer maar een gele melding (13 nov); "werkrecht" staat sinds 10 nov niet meer in de start (eigenaar):
// het recht om te werken wordt vóór de eerste betaalde klus gevraagd (lib/fiscal/eligibility.ts); met een EU-ID gaat het
// vanzelf. "tweestap" sinds 12 nov ook niet (eigenaar: optioneel); de stappen tonen hem als aanbeveling (WerkerStartWizard).
export const TIJDLIJN_VOLGORDE: TijdlijnSleutel[] = POORT_STAPPEN.map((s) => s.sleutel);

export type TijdlijnKlaar = Record<TijdlijnSleutel, boolean>;

export type TijdlijnStand = "klaar" | "actief" | "volgende";

export interface TijdlijnStap {
  key: TijdlijnSleutel;
  stand: TijdlijnStand;
}

/** Alle stappen op volgorde: wat klaar is, de eerste open stap als actief, de rest als volgende. */
export function tijdlijnStappen(klaar: TijdlijnKlaar): TijdlijnStap[] {
  const eerste = TIJDLIJN_VOLGORDE.find((k) => !klaar[k]);
  return TIJDLIJN_VOLGORDE.map((key) => ({
    key,
    stand: klaar[key] ? "klaar" : key === eerste ? "actief" : "volgende",
  }));
}

export function aantalOpen(klaar: TijdlijnKlaar): number {
  return TIJDLIJN_VOLGORDE.filter((k) => !klaar[k]).length;
}

export function volgendeStap(klaar: TijdlijnKlaar): TijdlijnSleutel | null {
  return TIJDLIJN_VOLGORDE.find((k) => !klaar[k]) ?? null;
}

/** "Stap 3 van 5": het nummer van de eerste open stap, en het aantal stappen; null als alles klaar is. */
export function stapVanTotaal(klaar: TijdlijnKlaar): { n: number; totaal: number; sleutel: TijdlijnSleutel } | null {
  const i = TIJDLIJN_VOLGORDE.findIndex((k) => !klaar[k]);
  const sleutel = TIJDLIJN_VOLGORDE[i];
  return i < 0 || !sleutel ? null : { n: i + 1, totaal: TIJDLIJN_VOLGORDE.length, sleutel };
}

/**
 * "Nog maar {n} stappen te gaan": de tekst met plaatshouder, enkelvoud of meervoud. Pools en Oekraïens hebben voor
 * 2-4 (en 22-24, …) een eigen vorm ("4 kroki", niet "4 kroków"): die staat in nogMeerFew en volgt Intl.PluralRules.
 */
export function nogStappenTekst(n: number, t: { nogEen: string; nogMeer: string; nogMeerFew?: string; alleKlaar: string }, taal?: string): string {
  if (n <= 0) return t.alleKlaar;
  if (n === 1) return t.nogEen;
  let vorm = t.nogMeer;
  if (t.nogMeerFew && taal) {
    try {
      if (new Intl.PluralRules(taal).select(n) === "few") vorm = t.nogMeerFew;
    } catch {
      // onbekende taalcode: de gewone meervoudsvorm
    }
  }
  return vorm.replace("{n}", String(n));
}

export type ReageerStap = "identiteit" | "werkrecht" | "gegevens" | "anders";

/**
 * Welke stap mist er volgens de reden die de server gaf (Nederlandse zin uit
 * getMarketplace/payoutEligibility/werkrecht)? Alleen om de juiste knop te tonen.
 */
export function reageerStap(reden: string | null | undefined): ReageerStap {
  const r = (reden ?? "").toLowerCase();
  if (/recht om te werken|werkrecht|werkvergunning|verblijf/.test(r)) return "werkrecht";
  if (/identiteit|id-controle|verificatie|geverifieerd/.test(r)) return "identiteit";
  if (/bsn|rekeningnummer|iban|kvk|btw|uitzend|overeenkomst|contract|gegevens|fiscaa/.test(r)) return "gegevens";
  return "anders";
}

export function reageerStapHref(stap: ReageerStap): string {
  return stap === "werkrecht" ? "/dashboard/verificatie#werkrecht" : "/dashboard/verificatie"; // gegevens en identiteit staan allebei op het stappenscherm
}
