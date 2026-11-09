// Waarom staat een identiteitscontrole in review? Een korte opsomming van de controles die niet
// klopten, voor het auditspoor en de melding aan de eigenaar. Alleen de vaste namen van de
// controles (nooit de uitleg, die persoonsgegevens kan bevatten). Puur, getest.

export interface KycControle {
  label: string;
  ok: boolean;
  /** alleen voor medewerkers; de werker ziet deze controle niet */
  intern?: boolean;
}

/** De namen van de controles die niet klopten, in volgorde, hooguit `max`. */
export function mislukteControles(checks: KycControle[], max = 4): string[] {
  return checks.filter((c) => !c.ok).map((c) => c.label).slice(0, max);
}

/** " (naam komt overeen; code op het document)" of een lege tekst als alles klopte. */
export function redenTekst(checks: KycControle[], max = 4): string {
  const lijst = mislukteControles(checks, max);
  return lijst.length === 0 ? "" : ` (niet in orde: ${lijst.join("; ")})`;
}
