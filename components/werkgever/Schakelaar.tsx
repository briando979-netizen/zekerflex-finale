"use client";

import { schakelaarKlassen } from "@/components/werkgever/bouwstenen";

// De schakelaar van de werkgeversapp (23 nov 2026, zoals bij Klus-instellingen en Notificaties van YoungOnes): rechts naast de
// uitleg, groen = aan. Een echte schakelaar voor een schermlezer (role="switch" met een naam en de uitleg erbij) en een tikdoel
// van minstens 44 px. Het scherm dat hem toont bewaart zelf en geeft de stand door die de server teruggaf.

export function Schakelaar({
  aan,
  label,
  beschrijvingId,
  uit = false,
  onWissel,
  tekst,
}: {
  aan: boolean;
  /** de naam van de instelling, voor een schermlezer */
  label: string;
  /** het id van de uitleg die bij deze schakelaar hoort */
  beschrijvingId?: string | undefined;
  /** niet te bedienen (bezig met bewaren, of alleen een beheerder mag het) */
  uit?: boolean;
  onWissel: () => void;
  /** het woord naast de schakelaar ("Aan" of "Uit") */
  tekst?: string | undefined;
}) {
  const k = schakelaarKlassen(aan);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aan}
      aria-label={label}
      aria-describedby={beschrijvingId}
      disabled={uit}
      onClick={onWissel}
      className="flex min-h-11 flex-shrink-0 items-center gap-2 rounded-full px-1 disabled:opacity-60"
    >
      <span className={k.baan}>
        <span className={k.knop} />
      </span>
      {tekst ? <span className="w-8 text-left text-sm font-semibold text-ink">{tekst}</span> : null}
    </button>
  );
}
