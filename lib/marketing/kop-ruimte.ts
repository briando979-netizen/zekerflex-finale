// Past de volle kopbalk (menu, schakelaar Werkers | Bedrijven, Inloggen en de hoofdknop) in deze taal op een laptop? (28 nov 2026)
// Gemeten op 1280 en 1366 px: talen tot 1,12 keer de Nederlandse tekstlengte passen (bg cs pl ru sk hu uk it en hr lt tr), vanaf
// 1,20 niet meer (el lv pt ro de es fr; fr 165 px te breed). Zo'n taal krijgt tot 1600 px de compacte balk met de menuknop, en op
// de telefoon alleen het beeldmerk (Duits was daar 13 px te breed). Puur: geen imports, dus veilig in de client.

/** Boven deze verhouding tot het Nederlands krijgt de kop meer ruimte. */
export const KOP_RUIMTE_GRENS = 1.15;

/**
 * `zinnen` staan allemaal tegelijk in de balk (opgeteld); van `knoppen` staat er één (de langste telt).
 * `tx` geeft een zin zonder vertaling ongewijzigd terug, dus in het Nederlands is de verhouding precies 1.
 */
export function kopHeeftRuimteNodig(tx: (zin: string) => string, zinnen: readonly string[], knoppen: readonly string[]): boolean {
  const lengte = (t: (zin: string) => string) => zinnen.reduce((n, z) => n + t(z).length, 0) + Math.max(0, ...knoppen.map((z) => t(z).length));
  const nl = lengte((z) => z);
  return nl > 0 && lengte(tx) / nl > KOP_RUIMTE_GRENS;
}
