// ---------------------------------------------------------------------------
// Waar een klus van een bedrijf staat (23 nov 2026, naar de vijf statussen van YoungOnes): Openstaand · Klaar om uit te
// voeren · Wordt uitgevoerd · Uren controleren · Gearchiveerd, plus onze eigen Concept en Geannuleerd. Puur: de
// kluspagina (app/werkgever/diensten/[shiftId]) toont er de pil mee en de klussenlijst (app/werkgever/diensten) deelt
// er de tabbladen mee in, zodat elke klus in precies één tab staat (een voorbije volle klus stond in twee).
// De database kent acht statussen (ShiftStatus); de fase komt daaruit plus de tijd en de uren.
// ---------------------------------------------------------------------------

export type KlusFase = "concept" | "openstaand" | "klaar" | "bezig" | "uren" | "archief" | "geannuleerd";

const WERVEN = ["OPEN", "MATCHING", "PARTIALLY_FILLED"];

export interface KlusVoorFase {
  status: string;
  startsAt: Date;
  endsAt: Date;
  /** aantal ingeplande krachten (niet geannuleerd) */
  aangenomen: number;
  /** er is een ingeplande kracht van wie de uren nog niet zijn goedgekeurd of betaald */
  urenOpen: boolean;
}

export function klusFase(s: KlusVoorFase, now: number): KlusFase {
  if (s.status === "CANCELLED") return "geannuleerd";
  if (s.status === "DRAFT") return "concept";
  if (s.status === "COMPLETED") return "archief";
  if (s.endsAt.getTime() <= now) return s.aangenomen > 0 && s.urenOpen ? "uren" : "archief";
  if (s.startsAt.getTime() <= now) return s.aangenomen > 0 ? "bezig" : "openstaand";
  if (s.status === "IN_PROGRESS") return "bezig";
  return s.status === "FILLED" ? "klaar" : "openstaand";
}

/**
 * De kleur van de pil, in de kleurbetekenissen van ZekerFlex: amber = wacht op jou (kies je krachten), blauw = gepland,
 * groen = loopt, goud = geld (uren nakijken), grijs = klaar of nog niet live, rood = gaat niet door.
 */
export const FASE_TOON: Record<KlusFase, "warn" | "plan" | "ok" | "money" | "neutral" | "crit"> = {
  concept: "neutral",
  openstaand: "warn",
  klaar: "plan",
  bezig: "ok",
  uren: "money",
  archief: "neutral",
  geannuleerd: "crit",
};

/** Zijn de uren van deze kracht nog niet rond? (geen urenstaat, of nog niet goedgekeurd of betaald) */
export function urenNogOpen(timesheetStatus: string | null | undefined): boolean {
  return timesheetStatus !== "APPROVED" && timesheetStatus !== "PAID";
}

export type KlusTab = "open" | "gepland" | "historie";

/**
 * In welk tabblad van de klussenlijst staat deze klus? Precies één: voorbij, afgerond of geannuleerd is historie; wie nog
 * krachten zoekt staat bij open; de rest (vol, loopt, concept) bij gepland.
 */
export function klusTab(s: { status: string; endsAt: Date }, now: number): KlusTab {
  if (s.status === "CANCELLED" || s.status === "COMPLETED" || s.endsAt.getTime() < now) return "historie";
  return WERVEN.includes(s.status) ? "open" : "gepland";
}
