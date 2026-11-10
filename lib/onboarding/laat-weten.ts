// ---------------------------------------------------------------------------
// "Laat weten wie je bent": de stappen van de werker-start als tijdlijn, en de
// stap die een werker nog mist als hij niet mag reageren. Puur bestand, alleen
// weergave-logica: de regels zelf staan in lib/onboarding/werker-poort.ts en op
// de server (lib/fiscal/eligibility.ts, lib/werkrecht).
// ---------------------------------------------------------------------------

export type TijdlijnSleutel = "kind" | "branches" | "email" | "verify" | "werkrecht";

export const TIJDLIJN_VOLGORDE: TijdlijnSleutel[] = ["kind", "branches", "email", "verify", "werkrecht"];

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

/** "Nog maar {n} stappen te gaan": de tekst met plaatshouder, enkelvoud of meervoud. */
export function nogStappenTekst(n: number, t: { nogEen: string; nogMeer: string; alleKlaar: string }): string {
  if (n <= 0) return t.alleKlaar;
  return n === 1 ? t.nogEen : t.nogMeer.replace("{n}", String(n));
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
  return stap === "werkrecht" ? "/dashboard/verificatie#werkrecht" : "/dashboard/verificatie";
}
