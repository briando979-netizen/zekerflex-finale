// ---------------------------------------------------------------------------
// "Vul nog in: …" voor formulieren (14 nov 2026). Een verzendknop die uit staat tot alles klopt, zonder uitleg, is een
// dode knop: geen klik, geen melding, geen meting (gemeten op /demo en /klus-plaatsen). Daarom blijft de knop aan en
// zegt een melding met role="alert" welk veld ontbreekt. Dit bestand is puur en browser-veilig; de zin kan in elke taal
// (de werker-app geeft de woorden mee), het veld krijgt een code voor de anonieme meting
// (lib/analytics/formulier-meting.ts: formulier:<naam>:melding:<veld>).
// ---------------------------------------------------------------------------

export interface VeldControle {
  /** code voor de meting, [a-z0-9-] */
  code: string;
  /** de naam zoals de bezoeker het veld kent ("je e-mailadres") */
  naam: string;
  /** true = ontbreekt of klopt niet */
  mist: boolean;
}

export interface OntbreektWoorden {
  /** "Vul nog in" */
  vulNogIn: string;
  /** "en" */
  en: string;
}

export const WOORDEN_NL: OntbreektWoorden = { vulNogIn: "Vul nog in", en: "en" };

/** "a", "a en b", "a, b en c" */
export function opsomming(delen: readonly string[], en = WOORDEN_NL.en): string {
  if (delen.length <= 1) return delen[0] ?? "";
  return `${delen.slice(0, -1).join(", ")} ${en} ${delen[delen.length - 1]}`;
}

/** De zin "Vul nog in: a, b en c." in de taal van de woorden. */
export function vulNogIn(namen: readonly string[], woorden: OntbreektWoorden = WOORDEN_NL): string {
  return `${woorden.vulNogIn}: ${opsomming(namen, woorden.en)}.`;
}

/**
 * Wat ontbreekt er? null als alles klopt. `veld` is de code van het eerste ontbrekende veld (voor de meting), `tekst`
 * noemt alle lege velden in één zin. Een veld met een eigen zin (bijv. "Kies een sterker wachtwoord.") geef je mee als
 * `eigenTekst`: dan is dat de melding, als er verder niets leeg is.
 */
export function eersteOntbrekend(
  velden: readonly (VeldControle & { eigenTekst?: string })[],
  woorden: OntbreektWoorden = WOORDEN_NL,
): { veld: string; tekst: string } | null {
  const leeg = velden.filter((v) => v.mist && !v.eigenTekst);
  if (leeg.length) return { veld: leeg[0]!.code, tekst: vulNogIn(leeg.map((v) => v.naam), woorden) };
  const eigen = velden.find((v) => v.mist && v.eigenTekst);
  return eigen ? { veld: eigen.code, tekst: eigen.eigenTekst! } : null;
}
