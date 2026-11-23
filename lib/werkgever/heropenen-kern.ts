import type { ShiftStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// "Klussen automatisch heropenen" (Instellingen → Klus-instellingen, 23 nov 2026, naar YoungOnes). Zegt een werker af nadat alle plekken van
// een klus gevuld zijn (de klus staat op "volledig bezet", bij YoungOnes "klaar om uit te voeren"), dan ging de klus tot nu toe altijd
// meteen weer open: een nieuwe zoektocht naar een vervanger, standby-werkers en de reserves horen het (app/api/me/assignments/[assignmentId]/cancel).
// Dat blijft de standaard. Zet een bedrijf het uit, dan blijft zo'n volle klus op "volledig bezet" staan, start er niets vanzelf en zet het
// bedrijf de klus zelf weer open (knop op de klus, heropenShiftAction). Een klus die nog niet vol was is al open en verandert niet.
// Puur bestand (geen prisma of kv): de opslag staat in lib/werkgever/heropenen.ts.
// ---------------------------------------------------------------------------

/** Wat er per bedrijf wordt bewaard. Geen gebruikers-id: wie het wijzigde staat in het auditspoor. */
export interface HeropenInstelling {
  /** false = een volle klus gaat niet vanzelf weer open als iemand afzegt */
  automatisch: boolean;
  /** wanneer het bedrijf automatisch heropenen uitzette (ISO), voor de weergave */
  sinds: string | null;
}

/** Zonder keuze van het bedrijf: een klus gaat vanzelf weer open, zoals het altijd werkte. */
export const STANDAARD_HEROPENEN: HeropenInstelling = { automatisch: true, sinds: null };

/** Soepel lezen: alleen een uitdrukkelijk `automatisch: false` zet het uit; al het andere (leeg, rommel) is de standaard. */
export function leesHeropenInstelling(raw: unknown): HeropenInstelling {
  if (!raw || typeof raw !== "object") return STANDAARD_HEROPENEN;
  const o = raw as { automatisch?: unknown; sinds?: unknown };
  if (o.automatisch !== false) return STANDAARD_HEROPENEN;
  return { automatisch: false, sinds: typeof o.sinds === "string" ? o.sinds : null };
}

/** Blijft de klus staan zoals hij stond? Alleen een volle klus bij een bedrijf dat automatisch heropenen uitzette. */
export function blijftVolNaAfzegging(huidig: ShiftStatus, automatisch: boolean): boolean {
  return huidig === "FILLED" && !automatisch;
}

/** De status van de klus na een afzegging, met `actief` het aantal plekken dat nog bezet is. */
export function statusNaAfzegging(huidig: ShiftStatus, actief: number, automatisch: boolean): ShiftStatus {
  if (blijftVolNaAfzegging(huidig, automatisch)) return huidig;
  return actief <= 0 ? "OPEN" : "PARTIALLY_FILLED";
}

/** Status voor het weer openzetten van een volle klus waar een plek vrij is: OPEN zonder iemand, anders deels bezet. */
export function statusNaHeropenen(actief: number): ShiftStatus {
  return actief <= 0 ? "OPEN" : "PARTIALLY_FILLED";
}
