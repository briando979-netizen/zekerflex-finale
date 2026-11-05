// ---------------------------------------------------------------------------
// Klanten behouden bij domeinnamen (pure regels). Eigenaar, 5 nov: verhuizen
// gaat via ZekerFlex, en zodra een klant weg wil krijgt ZekerFlex meteen een
// melding om hem met een aanbod te houden. De opslag staat in behoud.ts.
//
// De verhuisweg voor de klant: reden kiezen → aanbod om te blijven → toch
// verhuizen → de verhuiscode komt na VERHUISCODE_NA_UREN per mail (genoeg tijd
// om te bellen, ruim binnen de termijn van het register). Het aanbod: volgend
// jaar verlengen tegen de inkoopprijs (de marge eraf), dus nooit met verlies.
// ---------------------------------------------------------------------------

export const VERHUISCODE_NA_UREN = 20;

export const VERHUIS_REDENEN = ["te-duur", "andere-partij", "niet-meer-nodig", "anders"] as const;
export type VerhuisReden = (typeof VERHUIS_REDENEN)[number];
export const isVerhuisReden = (s: unknown): s is VerhuisReden => typeof s === "string" && (VERHUIS_REDENEN as readonly string[]).includes(s);
export const VERHUIS_REDEN_LABEL: Record<VerhuisReden, string> = {
  "te-duur": "Te duur",
  "andere-partij": "Ik ga met mijn website naar een andere partij",
  "niet-meer-nodig": "Ik heb de naam niet meer nodig",
  anders: "Iets anders",
};

export type VerhuisStap = "aanbod" | "gebleven" | "code-wacht" | "code-verstuurd" | "vertrokken";

export interface Verhuis {
  stap: VerhuisStap;
  reden: VerhuisReden;
  op: string;
  /** wanneer de klant "toch verhuizen" koos */
  bevestigdOp?: string | undefined;
  codeOp?: string | undefined;
}

export interface Aanbod {
  /** de normale verlengprijs, excl. btw */
  normaalCent: number;
  /** de prijs als de klant blijft, excl. btw */
  aanbodCent: number;
}

/** Het aanbod om te blijven: volgend jaar tegen de inkoopprijs. Geen aanbod als dat geen korting is. */
export function blijfAanbod(verlengCent: number, inkoopVerlengCent: number): Aanbod | null {
  if (!Number.isFinite(verlengCent) || !Number.isFinite(inkoopVerlengCent) || inkoopVerlengCent <= 0 || inkoopVerlengCent >= verlengCent) return null;
  return { normaalCent: verlengCent, aanbodCent: inkoopVerlengCent };
}

/** Is het tijd om de verhuiscode te sturen? */
export function codeMagNu(v: Verhuis, nu: Date): boolean {
  if (v.stap !== "code-wacht" || !v.bevestigdOp) return false;
  return nu.getTime() - new Date(v.bevestigdOp).getTime() >= VERHUISCODE_NA_UREN * 3_600_000;
}

/** Een domein dat bij ons hoort te blijven: verhuisslot dicht houden, behalve als de klant zijn code al kreeg. */
export const slotMagOpen = (v: Verhuis | null): boolean => v?.stap === "code-verstuurd";

/** Wijst het domein nog naar onze server? (A-records; leeg = onbekend, geen alarm) */
export function wijstNaarOns(adressen: string[], onsIpv4: string): boolean | null {
  if (adressen.length === 0) return null;
  return adressen.includes(onsIpv4);
}

/** Inkoop bij het register gestegen boven onze verkoopprijs? Dan maken we verlies. */
export function margeTeKort(eigen: { prijsCent: number; verlengCent: number }, inkoop: { price: number; recurringPrice: number }): boolean {
  return inkoop.price > eigen.prijsCent || inkoop.recurringPrice > eigen.verlengCent;
}
