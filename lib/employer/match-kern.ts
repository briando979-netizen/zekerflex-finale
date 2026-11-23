import { naamVoorMatch } from "@/lib/werkgever/naam";

// ---------------------------------------------------------------------------
// "De match" tussen een bedrijf en een werker (besluit van de eigenaar, 23 nov 2026). Puur: de profielkaart, de favorieten,
// de chat en de tests delen deze regels.
//   - De volledige naam: zodra de werker één keer bij het bedrijf is ingepland (en die inplanning niet is geannuleerd).
//     Wie alleen reageerde, in de wachtrij staat of favoriet is gemaakt, heet "Sanne V." (lib/werkgever/naam.ts).
//   - Telefoonnummer en e-mailadres: alleen zolang de werker is ingepland op een klus van het bedrijf die nog loopt of
//     hooguit 14 dagen geleden afliep (uren nakijken, nabellen). Daarna zijn ze weer weg.
// Een geannuleerde inplanning of een geannuleerde klus telt nooit.
// ---------------------------------------------------------------------------

/** zo lang na het einde van een klus blijven de contactgegevens van een ingeplande kracht zichtbaar */
export const CONTACT_NAZORG_DAGEN = 14;
export const CONTACT_NAZORG_MS = CONTACT_NAZORG_DAGEN * 86_400_000;

export interface Inplanning {
  cancelledAt: Date | null;
  shift: { status: string; endsAt: Date };
}

const telt = (r: Inplanning) => !r.cancelledAt && r.shift.status !== "CANCELLED";

/** Is de werker ooit bij dit bedrijf ingepland? Dan kent het bedrijf de volledige naam. */
export function naamBekend(inplanningen: readonly Inplanning[]): boolean {
  return inplanningen.some(telt);
}

/** Mag het bedrijf nu het telefoonnummer en e-mailadres zien? */
export function contactZichtbaar(inplanningen: readonly Inplanning[], now: Date): boolean {
  const grens = now.getTime() - CONTACT_NAZORG_MS;
  return inplanningen.some((r) => telt(r) && r.shift.endsAt.getTime() >= grens);
}

/** De naam van een werker zoals dit bedrijf hem mag zien. */
export function naamVoorBedrijf(volledig: string | null | undefined, bekend: boolean): string {
  return bekend ? (volledig ?? "").trim() : naamVoorMatch(volledig);
}
