import { ibanKlopt } from "@/lib/onboarding/velden";
import type { BetaalMethode, Winkel } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Betalen in de winkel van een klantsite, zonder betaalprovider: bij het
// afhalen, per overboeking (met een betaal-QR-code, lib/sites/betaal-qr.ts) of
// contant aan de bezorger. Online betalen met iDEAL kan
// nog niet: daarvoor is Stripe Connect nodig (owner-todo stripe-connect-profiel).
// Een winkel zonder instelling heeft geen keuze: die toont alleen zijn
// betaaltekst, zoals vóór 10 nov 2026. Puur en client-veilig.
// ---------------------------------------------------------------------------

export const BETAAL_METHODEN: BetaalMethode[] = ["afhalen", "overboeking", "rembours"];

export const BETAAL_NAAM: Record<BetaalMethode, string> = {
  afhalen: "Betalen bij afhalen",
  overboeking: "Overboeking",
  rembours: "Contant bij bezorgen",
};

/** Wat de klant bij het kiezen leest. */
export const BETAAL_UITLEG: Record<BetaalMethode, string> = {
  afhalen: "Je betaalt als je de bestelling ophaalt.",
  overboeking: "Je maakt het bedrag zelf over. Na het bestellen zie je het rekeningnummer, het bedrag en de omschrijving.",
  rembours: "Je betaalt contant aan de bezorger. Zorg dat je het bedrag gepast klaar hebt.",
};

/** Een IBAN zonder spaties en in hoofdletters. */
export const schoonIban = (s: string): string => s.replace(/\s+/g, "").toUpperCase();

/** Een IBAN in groepjes van vier, zoals op een bankpas: "NL91 ABNA 0417 1643 00". */
export const toonIban = (s: string): string => schoonIban(s).replace(/(.{4})(?=.)/g, "$1 ");

/** Het controlegetal van het IBAN klopt (MOD-97). */
export const ibanGeldig = (s: string): boolean => ibanKlopt(schoonIban(s));

/** De betaalmethoden waaruit een klant kiest; overboeking alleen met een geldig IBAN en een naam. */
export function betaalOpties(w: Pick<Winkel, "betalen">): BetaalMethode[] {
  const b = w.betalen;
  if (!b) return [];
  return BETAAL_METHODEN.filter((m) => b.methoden.includes(m) && (m !== "overboeking" || (ibanGeldig(b.iban) && b.tenaamstelling.trim().length > 0)));
}

/** Past deze betaalmethode bij afhalen of bezorgen? Overboeken past altijd. */
export function betaalPast(m: BetaalMethode, soort: "afhalen" | "bezorgen"): boolean {
  if (m === "afhalen") return soort === "afhalen";
  if (m === "rembours") return soort === "bezorgen";
  return true;
}
