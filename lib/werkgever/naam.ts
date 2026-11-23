// ---------------------------------------------------------------------------
// De naam van een werker zoals een bedrijf hem ziet vóór de match (23 nov 2026): de voornaam en alleen de eerste letter
// van de achternaam ("Sanne V."). De achternaam voluit hoort, net als telefoon en e-mail, pas bij een ingeplande kracht.
// Puur: de kluspagina, de profielkaart en de test (tests/kluspagina-privacy.test.ts) delen deze regel.
// ---------------------------------------------------------------------------

export function naamVoorMatch(volledig: string | null | undefined): string {
  const delen = (volledig ?? "").trim().split(/\s+/).filter(Boolean);
  const voornaam = delen[0] ?? "";
  if (delen.length < 2) return voornaam;
  // de eerste letter van het laatste woord: "Jan de Vries" wordt "Jan V."
  const letter = Array.from(delen[delen.length - 1] ?? "")[0] ?? "";
  return letter ? `${voornaam} ${letter.toUpperCase()}.` : voornaam;
}
