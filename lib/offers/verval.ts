// ---------------------------------------------------------------------------
// Wanneer een openstaande reactie op een klus vervalt ("niet uitgekozen"): de
// klus is begonnen zonder dat de opdrachtgever koos, de klus is geannuleerd of
// bestaat niet meer. Puur, zodat "Mijn klussen" (lezen) en de opruimronde
// (lib/offers/expire.ts) precies dezelfde regel gebruiken.
// ---------------------------------------------------------------------------

/** Reageren kan tot 2 uur na de start (app/dashboard/klussen/actions.ts); daarna vervalt een openstaande reactie. */
export const REACTIE_MARGE_MS = 2 * 60 * 60 * 1000;

export type Verval = "begonnen" | "geannuleerd" | "weg";

export function reactieVervalt(shift: { startsAt: Date; status: string } | null | undefined, now: Date | number): Verval | null {
  const t = typeof now === "number" ? now : now.getTime();
  if (!shift) return "weg";
  if (shift.status === "CANCELLED") return "geannuleerd";
  if (shift.startsAt.getTime() + REACTIE_MARGE_MS < t) return "begonnen";
  return null;
}

/** Een open vervangingsverzoek heeft geen zin meer zodra de klus begonnen is. */
export function vervangingVervalt(startsAt: Date | string, now: Date | number): boolean {
  const t = typeof now === "number" ? now : now.getTime();
  return new Date(startsAt).getTime() < t;
}
