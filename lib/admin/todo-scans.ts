// Eigenaar-taak (14 nov 2026): gratis scans die op opvolging wachten. Na de website- of review-check staat er per bedrijf
// een voorstel op maat klaar, maar ZekerFlex mailt dat nooit vanzelf; tot nu toe stonden deze bedrijven alleen in de
// dagmail aan sales@ (lib/scans/dagoverzicht.ts). Puur: alleen aantallen uit scanOverzicht (lib/scans/overzicht.ts).

import type { OwnerTodo } from "@/lib/admin/owner-todos";

export interface ScanOpvolgStand {
  /** contact gevraagd of verder gekeken, nog niet gemaild, actief in de laatste 14 dagen (één per bedrijf) */
  wachten: number;
  /** daarvan: vroeg zelf om contact */
  aanvragen: number;
}

/** `undefined` = niet kunnen lezen (dan geen taak, om niets vals te tonen). */
export function scanOpvolgTodo(stand: ScanOpvolgStand | undefined): OwnerTodo | null {
  if (!stand) return null;
  const { wachten, aanvragen } = stand;
  return {
    id: "scans-opvolgen",
    group: "Overig",
    title: wachten
      ? `${wachten} gratis scan${wachten === 1 ? " wacht" : "s wachten"} op opvolging${aanvragen ? `, ${aanvragen} vroeg${aanvragen === 1 ? "" : "en"} zelf om contact` : ""}`
      : "Gratis scans opvolgen",
    why: "Na de gratis website- of review-check staat er per bedrijf een voorstel op maat klaar. ZekerFlex mailt dat nooit vanzelf: alleen een mens volgt op. Tot nu toe stonden deze bedrijven alleen in de dagmail aan sales@. Ook scans die je zelf voor een bedrijf deed, tellen mee.",
    how: [
      "Open Beheer → Scans & deals. Wie zelf om contact vroeg, staat bovenaan: neem die als eerste op.",
      "Kies bij een bedrijf 'Stuur voorstel', vul het e-mailadres in en kies 'Mail voorstel'. Dat kan hooguit één keer per week per scan en nooit naar een testadres; de mail heeft een afmeldlink.",
      "Past het niet, laat de scan dan liggen: na 14 dagen zonder activiteit telt hij niet meer mee. Deze taak vinkt zichzelf af als er niets meer wacht.",
    ],
    auto: true,
    done: wachten === 0,
    ...(wachten === 0 ? { doneNote: "er wacht geen scan op opvolging" } : {}),
  };
}
